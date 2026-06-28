import Anthropic from "@anthropic-ai/sdk";
import { LeadStatus, Prisma } from "@prisma/client";

import { runConversationAgent } from "@/lib/agent/run-agent";
import { env } from "@/lib/config";
import { sendIntro } from "@/lib/email";
import { ensureConversation } from "@/lib/leads";
import { inngest } from "@/lib/inngest/client";
import { sendFreeformWithPolicy, sendTemplateWithPolicy } from "@/lib/messaging";
import { prisma } from "@/lib/prisma";
import { writeConversationUpdateToSalesforce } from "@/lib/salesforce";

const anthropic = env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  : null;

async function buildTranscriptSummary(conversationId: string) {
  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, body: true, createdAt: true },
  });

  if (!messages.length) {
    return "No transcript available yet.";
  }

  const transcript = messages
    .map((message) => `[${message.createdAt.toISOString()}] ${message.role}: ${message.body}`)
    .join("\n");

  if (!anthropic) {
    return transcript.slice(0, 3000);
  }

  try {
    const response = await anthropic.messages.create({
      model: env.ANTHROPIC_CLASSIFIER_MODEL,
      max_tokens: 220,
      system:
        "Summarise this property lead conversation for Salesforce activity logging in max 6 bullets.",
      messages: [{ role: "user", content: transcript }],
    });

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
  } catch {
    return transcript.slice(0, 3000);
  }
}

export const onLeadCreated = inngest.createFunction(
  { id: "on-lead-created", triggers: [{ event: "lead/created" }] },
  async ({ event, step }) => {
    const lead = await step.run("load-lead", async () =>
      prisma.lead.findUnique({ where: { id: event.data.leadId } }),
    );

    if (!lead || lead.optedOut) {
      return { skipped: true };
    }

    const conversation = await step.run("ensure-conversation", () => ensureConversation(lead.id));

    await step.run("send-intro-fanout", async () => {
      const tasks: Promise<unknown>[] = [];
      if (env.TWILIO_TEMPLATE_INTRO_SID) {
        tasks.push(
          sendTemplateWithPolicy({
            lead,
            conversationId: conversation.id,
            templateSid: env.TWILIO_TEMPLATE_INTRO_SID,
            vars: {
              "1": lead.firstName ?? "there",
              "2": lead.enquiryType ?? "your enquiry",
              "3": env.CONSULTANT_NAME,
            },
            bodyForLog:
              "Intro template sent: warm One Homes greeting, AI disclosure, and STOP opt-out notice.",
          }),
        );
      }

      tasks.push(
        sendIntro({
          firstName: lead.firstName ?? null,
          email: lead.email ?? null,
          enquiryType: lead.enquiryType ?? null,
        }),
      );

      await Promise.all(tasks);
    });

    await step.run("mark-contacted", async () =>
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.CONTACTED },
      }),
    );

    return { ok: true };
  },
);

export const onMessageReceived = inngest.createFunction(
  { id: "on-message-received", triggers: [{ event: "message/received" }] },
  async ({ event, step }) => {
    const conversation = await step.run("load-conversation", async () =>
      prisma.conversation.findUnique({
        where: { id: event.data.conversationId },
        include: { lead: true },
      }),
    );

    if (!conversation || conversation.handoff || conversation.lead.optedOut) {
      return { skipped: true };
    }

    const result = await step.run("run-agent", () =>
      runConversationAgent({
        leadId: event.data.leadId,
        conversationId: event.data.conversationId,
        inboundMessageId: event.data.messageId,
      }),
    );

    if (result.skipped || !result.reply) {
      return { skipped: true };
    }

    const delivery = await step.run("send-reply", () =>
      sendFreeformWithPolicy({
        lead: conversation.lead,
        conversationId: conversation.id,
        body: result.reply,
        fallbackTemplateVars: {
          "1": conversation.lead.firstName ?? "there",
          "2": env.CONSULTANT_NAME,
        },
      }),
    );

    await step.run("store-agent-metadata", async () => {
      if (!result.toolMeta?.length) {
        return;
      }

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "SYSTEM",
          body: "AI tool calls executed",
          meta: result.toolMeta as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await step.run("update-lead-status", async () => {
      const refreshed = await prisma.lead.findUniqueOrThrow({
        where: { id: conversation.lead.id },
      });

      if (refreshed.optedOut || refreshed.status === LeadStatus.HANDED_OFF) {
        return;
      }

      await prisma.lead.update({
        where: { id: refreshed.id },
        data: {
          status: delivery.sent ? LeadStatus.ENGAGED : refreshed.status,
          aiDisclosureSentAt: refreshed.aiDisclosureSentAt ?? new Date(),
        },
      });
    });

    await step.sendEvent("sync-salesforce", {
      name: "salesforce/sync",
      data: {
        leadId: conversation.lead.id,
        conversationId: conversation.id,
      },
    });

    return { ok: true };
  },
);

export const syncToSalesforce = inngest.createFunction(
  { id: "sync-to-salesforce", triggers: [{ event: "salesforce/sync" }] },
  async ({ event, step }) => {
    const lead = await step.run("load-lead-for-sync", async () =>
      prisma.lead.findUnique({
        where: { id: event.data.leadId },
      }),
    );

    if (!lead?.salesforceId) {
      return { skipped: true, reason: "No Salesforce ID" };
    }

    const summary = await step.run("summarise-transcript", () =>
      buildTranscriptSummary(event.data.conversationId),
    );

    const response = await step.run("write-salesforce", () =>
      writeConversationUpdateToSalesforce({
        salesforceId: lead.salesforceId!,
        status: lead.status,
        qualificationJson: JSON.stringify(lead.qualification ?? {}),
        viewedBooked: lead.status === LeadStatus.VIEWING_BOOKED,
        optedOut: lead.optedOut,
        transcriptSummary: summary,
      }),
    );

    return response;
  },
);

export const staleLeadNudge = inngest.createFunction(
  { id: "stale-lead-nudge", triggers: [{ cron: "0 */2 * * *" }] },
  async ({ step }) => {
    if (!env.TWILIO_TEMPLATE_FOLLOWUP_SID) {
      return { skipped: true };
    }

    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const leads = await step.run("find-stale-leads", () =>
      prisma.lead.findMany({
        where: {
          optedOut: false,
          status: { in: [LeadStatus.CONTACTED, LeadStatus.ENGAGED] },
          OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }],
        },
        take: 50,
      }),
    );

    for (const lead of leads) {
      const conversation = await ensureConversation(lead.id);
      await step.run(`send-nudge-${lead.id}`, () =>
        sendTemplateWithPolicy({
          lead,
          conversationId: conversation.id,
          templateSid: env.TWILIO_TEMPLATE_FOLLOWUP_SID!,
          vars: {
            "1": lead.firstName ?? "there",
            "2": env.CONSULTANT_NAME,
          },
          bodyForLog: "Follow-up template queued/sent for stale lead.",
        }),
      );
    }

    return { total: leads.length };
  },
);

export const inngestFunctions = [
  onLeadCreated,
  onMessageReceived,
  syncToSalesforce,
  staleLeadNudge,
];
