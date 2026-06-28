import { LeadStatus, Role } from "@prisma/client";

import { classifyInboundMessage } from "@/lib/classifier";
import { BUSINESS_CONFIG } from "@/lib/config";
import { isWithinContactHours, isWithinCustomerCareWindow, nextAllowedContactDate } from "@/lib/contact-policy";
import { sendIntro } from "@/lib/email";
import { runAgentTurn } from "@/lib/agent";
import { inngest } from "@/lib/inngest";
import { appendMessage, getOrCreatePrimaryConversation, updateLeadQualification } from "@/lib/lead-service";
import { prisma } from "@/lib/prisma";
import { syncConversationToSalesforce } from "@/lib/salesforce";
import { sendFreeform, sendTemplate } from "@/lib/whatsapp";

export const onLeadCreated = inngest.createFunction(
  { id: "lead-created-fanout", retries: 3, triggers: [{ event: "lead/created" }] },
  async ({ event, step }) => {
    const lead = await step.run("load-lead", () =>
      prisma.lead.findUnique({
        where: { id: event.data.leadId },
      }),
    );

    if (!lead || !lead.phone || lead.optedOut) {
      return { skipped: true };
    }

    const conversation = await step.run("ensure-conversation", () =>
      getOrCreatePrimaryConversation(lead.id),
    );

    if (!isWithinContactHours()) {
      await step.sleepUntil("wait-for-contact-hours", nextAllowedContactDate());
    }

    await step.run("send-intro-whatsapp-and-email", async () => {
      const [templateResult, emailResult] = await Promise.all([
        sendTemplate(lead.phone!, BUSINESS_CONFIG.introTemplateSid, {
          "1": lead.firstName ?? "there",
          "2": lead.enquiryType ?? "your enquiry",
          "3": "One Homes",
          "4": BUSINESS_CONFIG.consultantName,
        }),
        sendIntro(lead),
      ]);

      await appendMessage({
        conversationId: conversation.id,
        role: Role.SYSTEM,
        channel: "WHATSAPP",
        body: "Intro WhatsApp template sent.",
        providerMessageId: templateResult.sid,
        meta: {
          type: "template",
          templateSid: BUSINESS_CONFIG.introTemplateSid,
        },
      });

      if (emailResult?.data?.id) {
        await appendMessage({
          conversationId: conversation.id,
          role: Role.SYSTEM,
          channel: "EMAIL",
          body: "Intro email sent.",
          providerMessageId: emailResult.data.id,
        });
      }
    });

    await step.run("mark-contacted", () =>
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.CONTACTED, lastActivityAt: new Date() },
      }),
    );

    await step.sendEvent("sync-status", {
      name: "lead/sync.requested",
      data: {
        leadId: lead.id,
        reason: "lead_created_fanout",
      },
    });

    return { ok: true };
  },
);

export const onMessageReceived = inngest.createFunction(
  { id: "message-received-agent-loop", retries: 3, triggers: [{ event: "message/received" }] },
  async ({ event, step }) => {
    const payload = await step.run("load-context", async () => {
      const lead = await prisma.lead.findUnique({
        where: { id: event.data.leadId },
      });
      const conversation = await prisma.conversation.findUnique({
        where: { id: event.data.conversationId },
      });
      const message = await prisma.message.findUnique({
        where: { id: event.data.messageId },
      });
      return { lead, conversation, message };
    });

    if (!payload.lead || !payload.conversation || !payload.message) {
      return { skipped: "missing-data" };
    }
    if (payload.lead.optedOut || payload.conversation.handoff) {
      return { skipped: "opted-out-or-handoff" };
    }

    if (!isWithinContactHours()) {
      await step.sleepUntil("wait-contact-hours", nextAllowedContactDate());
    }

    const classification = await step.run("classify-message", () =>
      classifyInboundMessage(payload.message!.body),
    );
    if (classification?.qualificationHints) {
      await step.run("persist-classification-hints", () =>
        updateLeadQualification(payload.lead!.id, classification.qualificationHints),
      );
    }

    const outcome = await step.run("run-agent-turn", () =>
      runAgentTurn({
        leadId: payload.lead!.id,
        conversationId: payload.conversation!.id,
      }),
    );

    if (outcome.optedOut || outcome.escalated || !outcome.reply || !payload.lead.phone) {
      await step.sendEvent("sync-after-nonreply", {
        name: "lead/sync.requested",
        data: { leadId: payload.lead.id, reason: "agent_nonreply" },
      });
      return { outcome };
    }

    const refreshedLead = await step.run("refresh-lead", () =>
      prisma.lead.findUnique({ where: { id: payload.lead!.id } }),
    );

    const lastInboundAt = refreshedLead?.lastInboundAt
      ? new Date(refreshedLead.lastInboundAt)
      : undefined;
    const canSendFreeform = isWithinCustomerCareWindow(lastInboundAt);
    if (canSendFreeform) {
      const sent = await step.run("send-whatsapp-freeform", () =>
        sendFreeform(payload.lead!.phone!, outcome.reply!),
      );
      await step.run("store-whatsapp-send", () =>
        appendMessage({
          conversationId: payload.conversation!.id,
          role: Role.SYSTEM,
          body: "AI reply sent via WhatsApp freeform.",
          providerMessageId: sent.sid,
          meta: { type: "freeform" },
        }),
      );
    } else {
      const sent = await step.run("send-template-fallback", () =>
        sendTemplate(payload.lead!.phone!, BUSINESS_CONFIG.introTemplateSid, {
          "1": payload.lead!.firstName ?? "there",
          "2": payload.lead!.enquiryType ?? "your enquiry",
          "3": "One Homes",
          "4": BUSINESS_CONFIG.consultantName,
        }),
      );
      await step.run("store-template-fallback", () =>
        appendMessage({
          conversationId: payload.conversation!.id,
          role: Role.SYSTEM,
          body: "24h window closed; fallback template sent.",
          providerMessageId: sent.sid,
          meta: { type: "template-fallback" },
        }),
      );
    }

    await step.run("status-to-engaged", () =>
      prisma.lead.update({
        where: { id: payload.lead!.id },
        data: {
          status: outcome.viewingBooked ? LeadStatus.VIEWING_BOOKED : LeadStatus.ENGAGED,
          lastActivityAt: new Date(),
        },
      }),
    );

    await step.sendEvent("sync-to-salesforce", {
      name: "lead/sync.requested",
      data: {
        leadId: payload.lead.id,
        reason: "message_received",
      },
    });

    return { outcome };
  },
);

export const syncToSalesforce = inngest.createFunction(
  { id: "lead-sync-to-salesforce", retries: 3, triggers: [{ event: "lead/sync.requested" }] },
  async ({ event, step }) => {
    const lead = await step.run("load-lead-with-conversation", () =>
      prisma.lead.findUnique({
        where: { id: event.data.leadId },
        include: {
          conversations: {
            include: {
              messages: {
                orderBy: { createdAt: "asc" },
              },
            },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      }),
    );

    if (!lead?.salesforceId) {
      return { skipped: "no-salesforce-id" };
    }

    const transcriptSummary = buildTranscriptSummary(
      lead.conversations[0]?.messages.map((message) => ({
        role: message.role,
        body: message.body,
      })) ?? [],
    );

    await step.run("sync-salesforce", () =>
      syncConversationToSalesforce({
        salesforceId: lead.salesforceId!,
        status: lead.status,
        qualification: (lead.qualification as Record<string, unknown> | null) ?? null,
        viewingBooked: lead.viewingBooked,
        optedOut: lead.optedOut,
        transcriptSummary,
      }),
    );

    return { ok: true };
  },
);

function buildTranscriptSummary(messages: Array<{ role: Role; body: string }>) {
  const lines = messages.slice(-25).map((message) => `${message.role}: ${message.body}`);
  return `One Homes AI concierge conversation summary\n\n${lines.join("\n")}`;
}

export const inngestFunctions = [onLeadCreated, onMessageReceived, syncToSalesforce];
