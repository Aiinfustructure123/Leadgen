import { Inngest } from "inngest";

import { runAgentLoop, summarizeConversation } from "@/lib/agent";
import { getContactHours, getConsultantName, getEnv } from "@/lib/config";
import {
  isInsideContactHours,
  isInsideWhatsAppCareWindow,
  nextContactWindowStart,
} from "@/lib/contact-hours";
import { prisma } from "@/lib/db";
import { sendIntro } from "@/lib/email";
import { appendMessage, getOrCreateConversation } from "@/lib/leads";
import { syncConversationToSalesforce } from "@/lib/salesforce";
import { sendFreeform, sendTemplate } from "@/lib/whatsapp";

export const inngest = new Inngest({
  id: "one-homes-ai-lead-concierge",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export const onLeadCreated = inngest.createFunction(
  { id: "on-lead-created" },
  { event: "lead/created" },
  async ({ event, step }) => {
    const leadId = event.data.leadId as string;
    const lead = await step.run("load lead", () => prisma.lead.findUniqueOrThrow({ where: { id: leadId } }));

    if (lead.optedOut) {
      return { skipped: true, reason: "Lead opted out." };
    }

    if (!isInsideContactHours()) {
      await step.sleepUntil("wait for contact hours", nextContactWindowStart());
    }

    const [whatsAppResult, emailResult] = await Promise.all([
      step.run("send WhatsApp intro template", async () => {
        if (!lead.phone) {
          return { skipped: true, reason: "Lead has no phone number." };
        }

        const conversation = await getOrCreateConversation(lead.id, "WHATSAPP");
        const result = await sendTemplate(lead.phone, getEnv("TWILIO_TEMPLATE_INTRO_SID"), {
          "1": lead.firstName || "there",
          "2": getConsultantName(),
          "3": lead.enquiryType || "your enquiry",
        });

        await appendMessage({
          conversationId: conversation.id,
          role: "AI",
          body: buildIntroTemplateCopy(lead.firstName, lead.enquiryType),
          meta: { templateSid: getEnv("TWILIO_TEMPLATE_INTRO_SID") },
          providerMessageId: result.providerMessageId,
        });

        return result;
      }),
      step.run("send intro email", async () => {
        const conversation = await getOrCreateConversation(lead.id, "EMAIL");
        const result = await sendIntro(lead);

        if (!result.skipped) {
          await appendMessage({
            conversationId: conversation.id,
            role: "AI",
            body: `Intro email sent for ${lead.enquiryType || "lead enquiry"}.`,
            meta: { providerMessageId: result.providerMessageId },
            providerMessageId: result.providerMessageId,
          });
        }

        return result;
      }),
    ]);

    await step.run("set contacted status", () =>
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONTACTED" },
      }),
    );

    return { whatsAppResult, emailResult };
  },
);

export const onMessageReceived = inngest.createFunction(
  { id: "on-message-received" },
  { event: "message/received" },
  async ({ event, step }) => {
    const conversationId = event.data.conversationId as string;

    if (!isInsideContactHours()) {
      await step.sleepUntil("wait for contact hours", nextContactWindowStart());
    }

    const loaded = await step.run("load conversation", () =>
      prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      }),
    );

    if (loaded.handoff || loaded.lead.optedOut) {
      await step.sendEvent("queue Salesforce sync", {
        name: "salesforce/sync",
        data: { leadId, conversationId },
      });
      return { skipped: true, reason: loaded.handoff ? "Human handoff active." : "Lead opted out." };
    }

    if (!isInsideWhatsAppCareWindow(loaded.lead.lastInboundAt)) {
      await step.run("record closed WhatsApp window", () =>
        appendMessage({
          conversationId,
          role: "SYSTEM",
          body: "AI reply skipped because the 24-hour WhatsApp care window is closed. Use an approved template for follow-up.",
        }),
      );
      return { skipped: true, reason: "WhatsApp care window closed." };
    }

    const agentResult = await step.run("run Claude agent", () =>
      runAgentLoop({
        lead: loaded.lead,
        conversation: loaded,
        messages: loaded.messages,
      }),
    );

    if (agentResult.reply) {
      await step.run("send WhatsApp reply", async () => {
        const latestLead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
        const result = await sendFreeform(latestLead.phone!, agentResult.reply!, {
          lastInboundAt: latestLead.lastInboundAt,
        });

        await appendMessage({
          conversationId,
          role: "AI",
          body: agentResult.reply!,
          meta: { toolCalls: agentResult.toolCalls },
          providerMessageId: result.providerMessageId,
        });
      });
    }

    await step.sendEvent("queue Salesforce sync", {
      name: "salesforce/sync",
      data: { leadId, conversationId },
    });

    return agentResult;
  },
);

export const syncToSalesforce = inngest.createFunction(
  { id: "sync-to-salesforce" },
  { event: "salesforce/sync" },
  async ({ event, step }) => {
    const leadId = event.data.leadId as string;
    const conversationId = event.data.conversationId as string;
    const conversation = await step.run("load transcript", () =>
      prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: {
          lead: true,
          messages: { orderBy: { createdAt: "asc" } },
        },
      }),
    );
    const summary = await step.run("summarize transcript", () => summarizeConversation(conversation.messages));

    return step.run("write Salesforce activity", () =>
      syncConversationToSalesforce({
        lead: conversation.lead,
        conversation,
        summary,
      }),
    );
  },
);

export const functions = [onLeadCreated, onMessageReceived, syncToSalesforce];

function buildIntroTemplateCopy(firstName?: string | null, enquiryType?: string | null): string {
  const greeting = firstName ? `Hi ${firstName}` : "Hi";
  const enquiry = enquiryType ? ` about ${enquiryType}` : "";

  return `${greeting}, thanks for your enquiry${enquiry}. I am ${getConsultantName()}'s AI assistant at One Homes. I can help with quick questions or arrange a viewing while ${getConsultantName()} is with clients. Reply STOP to opt out. Contact hours: ${getContactHours()}.`;
}
