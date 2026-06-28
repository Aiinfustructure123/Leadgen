import { LeadStatus, Role, type Lead } from "@prisma/client";

import { inngest } from "@/inngest/client";
import { agentMessageMeta, createEmailConversationMessage, runLeadAgent } from "@/lib/ai";
import { introTemplateCopy, appConfig, env } from "@/lib/config";
import { contactWindow, isInsideWhatsAppCareWindow } from "@/lib/contact-hours";
import { appendMessage, getOrCreateConversation } from "@/lib/conversations";
import { sendIntro } from "@/lib/email";
import { leadFirstName } from "@/lib/lead-utils";
import { prisma } from "@/lib/prisma";
import { syncLeadToSalesforce } from "@/lib/salesforce";
import { sendFreeform, sendTemplate } from "@/lib/whatsapp";

export const onLeadCreated = inngest.createFunction(
  { id: "on-lead-created", triggers: [{ event: "lead/created" }] },
  async ({ event, step }) => {
    const leadId = String(event.data.leadId);
    const window = contactWindow();

    if (!window.within) {
      await step.sleepUntil("wait-for-contact-hours", window.nextOpenAt);
    }

    const lead = (await step.run("load-lead", () =>
      prisma.lead.findUniqueOrThrow({
        where: { id: leadId }
      })
    )) as unknown as Lead;

    if (lead.optedOut) {
      return { skipped: true, reason: "Lead is opted out." };
    }

    const [whatsapp, email] = await Promise.all([
      step.run("send-whatsapp-template", async () => {
        if (!lead.phone || !env("TWILIO_TEMPLATE_INTRO_SID")) {
          return { skipped: true, reason: "Missing phone or approved intro template SID." };
        }

        const conversation = await getOrCreateConversation(lead.id);
        const body = renderIntroTemplate(lead);
        const result = await sendTemplate(lead.phone, env("TWILIO_TEMPLATE_INTRO_SID")!, {
          first_name: leadFirstName(lead),
          enquiry_type: lead.enquiryType ?? "your property enquiry",
          consultant_name: appConfig.consultantName
        });

        await appendMessage({
          conversationId: conversation.id,
          role: Role.AI,
          body,
          providerMessageId: result.providerMessageId,
          meta: {
            provider: "twilio",
            templateSid: env("TWILIO_TEMPLATE_INTRO_SID"),
            skipped: result.skipped,
            reason: result.reason
          }
        });

        return result;
      }),
      step.run("send-intro-email", async () => {
        const result = await sendIntro(lead);
        await createEmailConversationMessage(
          lead.id,
          `Intro email sent about ${lead.enquiryType ?? "property enquiry"}.`,
          result.providerMessageId
        );
        return result;
      })
    ]);

    await step.run("mark-contacted", () =>
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.CONTACTED,
          lastContactedAt: new Date()
        }
      })
    );

    return { whatsapp, email };
  }
);

export const onMessageReceived = inngest.createFunction(
  { id: "on-message-received", triggers: [{ event: "message/received" }] },
  async ({ event, step }) => {
    const conversationId = String(event.data.conversationId);

    const conversation = await step.run("load-conversation", () =>
      prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } }
        }
      })
    );

    if (conversation.handoff || conversation.lead.optedOut) {
      await step.sendEvent("sync-handoff-or-optout", {
        name: "salesforce/sync",
        data: { leadId: conversation.leadId }
      });
      return { skipped: true, reason: "Conversation is in handoff or lead is opted out." };
    }

    const agentResult = await step.run("run-agent", () => runLeadAgent(conversationId));

    if (agentResult.reply && agentResult.shouldSend) {
      await step.run("send-agent-reply", async () => {
        const latestLead = await prisma.lead.findUniqueOrThrow({ where: { id: conversation.leadId } });
        if (!latestLead.phone || (latestLead.optedOut && agentResult.status !== LeadStatus.OPTED_OUT)) {
          return { skipped: true, reason: "Lead cannot receive WhatsApp replies." };
        }

        if (!isInsideWhatsAppCareWindow(latestLead.lastInboundAt)) {
          await appendMessage({
            conversationId,
            role: Role.SYSTEM,
            body: "Free-form AI reply was not sent because the WhatsApp 24-hour customer-care window is closed.",
            meta: { policy: "whatsapp_24h_window", attemptedReply: agentResult.reply }
          });
          return { skipped: true, reason: "Outside WhatsApp care window." };
        }

        const sendResult = await sendFreeform(latestLead.phone, agentResult.reply!);
        await appendMessage({
          conversationId,
          role: Role.AI,
          body: agentResult.reply!,
          providerMessageId: sendResult.providerMessageId,
          meta: agentMessageMeta(agentResult)
        });
        return sendResult;
      });
    }

    if (agentResult.status) {
      await step.run("persist-agent-status", () =>
        prisma.lead.update({
          where: { id: conversation.leadId },
          data: { status: agentResult.status }
        })
      );
    }

    if (agentResult.handoff) {
      await step.run("persist-agent-handoff", () =>
        prisma.conversation.update({
          where: { id: conversationId },
          data: { handoff: true }
        })
      );
    }

    await step.sendEvent("sync-to-salesforce", {
      name: "salesforce/sync",
      data: { leadId: conversation.leadId }
    });

    return agentResult;
  }
);

export const syncToSalesforce = inngest.createFunction(
  { id: "sync-to-salesforce", triggers: [{ event: "salesforce/sync" }] },
  async ({ event, step }) => {
    const leadId = String(event.data.leadId);

    return step.run("write-salesforce", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({
        where: { id: leadId },
        include: {
          conversations: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" }
              }
            }
          }
        }
      });

      const messages = lead.conversations
        .flatMap((conversation) => conversation.messages)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      return syncLeadToSalesforce(lead, messages);
    });
  }
);

export const staleLeadNudge = inngest.createFunction(
  { id: "stale-lead-nudge", triggers: [{ event: "lead/stale-nudge" }] },
  async ({ event, step }) => {
    const leadId = String(event.data.leadId);
    const lead = (await step.run("load-stale-lead", () =>
      prisma.lead.findUniqueOrThrow({ where: { id: leadId } })
    )) as unknown as Lead;

    if (lead.optedOut || lead.status !== LeadStatus.CONTACTED || !lead.phone || !env("TWILIO_TEMPLATE_FOLLOWUP_SID")) {
      return { skipped: true };
    }

    const window = contactWindow();
    if (!window.within) {
      await step.sleepUntil("wait-for-contact-hours", window.nextOpenAt);
    }

    const result = await step.run("send-follow-up-template", () =>
      sendTemplate(lead.phone!, env("TWILIO_TEMPLATE_FOLLOWUP_SID")!, {
        first_name: leadFirstName(lead),
        consultant_name: appConfig.consultantName
      })
    );

    const conversation = await getOrCreateConversation(lead.id);
    await step.run("store-nudge-message", () =>
      appendMessage({
        conversationId: conversation.id,
        role: Role.AI,
        body: "Approved follow-up template sent.",
        providerMessageId: result.providerMessageId,
        meta: { provider: "twilio", templateSid: env("TWILIO_TEMPLATE_FOLLOWUP_SID"), skipped: result.skipped }
      })
    );

    return result;
  }
);

function renderIntroTemplate(lead: {
  firstName: string | null;
  email: string | null;
  phone: string | null;
  enquiryType: string | null;
}): string {
  return introTemplateCopy
    .replaceAll("{{first_name}}", leadFirstName(lead))
    .replaceAll("{{enquiry_type}}", lead.enquiryType ?? "your property enquiry")
    .replaceAll("{{consultant_name}}", appConfig.consultantName);
}

export const functions = [onLeadCreated, onMessageReceived, syncToSalesforce, staleLeadNudge];
