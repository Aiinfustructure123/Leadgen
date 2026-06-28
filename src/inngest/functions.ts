/* eslint-disable @typescript-eslint/no-explicit-any */
import { inngest } from "./client";
import { prisma } from "@/lib/prisma";
import { sendTemplate, sendFreeform } from "@/lib/whatsapp";
import { sendIntro } from "@/lib/email";
import { runAgent, summariseConversation } from "@/lib/agent";
import { syncLeadToSalesforce } from "@/lib/salesforce";
import { isWithinContactHours, isWithinWhatsAppWindow } from "@/lib/contact-hours";

/**
 * Triggered when a new lead arrives from Salesforce.
 * Fans out to: WhatsApp intro template + personalised email.
 */
export const onLeadCreated = inngest.createFunction(
  {
    id: "on-lead-created",
    retries: 3,
    triggers: [{ event: "lead/created" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const leadId = event.data.leadId as string;

    const lead = await step.run("fetch-lead", async () => {
      return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    });

    if (lead.optedOut) {
      return { skipped: "lead opted out" };
    }

    if (!isWithinContactHours()) {
      return { skipped: "outside contact hours" };
    }

    // Fan out: WhatsApp + email in parallel
    const [whatsappResult, emailResult] = await Promise.allSettled([
      step.run("send-whatsapp-intro", async () => {
        if (!lead.phone) return { skipped: "no phone" };

        const templateSid = process.env.TWILIO_TEMPLATE_INTRO_SID ?? "";
        if (!templateSid) {
          return { skipped: "no template SID configured" };
        }

        const messageSid = await sendTemplate({
          to: lead.phone,
          templateSid,
          vars: {
            "1": lead.firstName ?? "there",
            "2": lead.enquiryType ?? "your property enquiry",
          },
        });

        return { messageSid };
      }),

      step.run("send-intro-email", async () => {
        if (!lead.email) return { skipped: "no email" };
        const emailId = await sendIntro(lead);
        return { emailId };
      }),
    ]);

    const conversation = await step.run("create-conversation", async () => {
      return prisma.conversation.create({
        data: {
          leadId,
          channel: "WHATSAPP",
        },
      });
    });

    await step.run("update-lead-status", async () => {
      return prisma.lead.update({
        where: { id: leadId },
        data: { status: "CONTACTED" },
      });
    });

    return {
      conversationId: conversation.id,
      whatsapp: whatsappResult,
      email: emailResult,
    };
  }
);

/**
 * Triggered when the lead sends a WhatsApp message.
 * Runs the Claude agent loop and sends the reply.
 */
export const onMessageReceived = inngest.createFunction(
  {
    id: "on-message-received",
    retries: 3,
    triggers: [{ event: "message/received" }],
    concurrency: {
      scope: "fn",
      key: "event.data.conversationId",
      limit: 1,
    },
  },
  async ({ event, step }: { event: any; step: any }) => {
    const leadId = event.data.leadId as string;
    const conversationId = event.data.conversationId as string;

    const lead = await step.run("fetch-lead", async () => {
      return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    });

    if (lead.optedOut) {
      return { skipped: "lead opted out" };
    }

    const conversation = await step.run("fetch-conversation", async () => {
      return prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    });

    if (conversation.handoff) {
      return { skipped: "conversation handed off to human" };
    }

    const agentResult = await step.run("run-agent", async () => {
      return runAgent(leadId, conversationId);
    });

    if (agentResult.reply && !agentResult.escalated && !agentResult.optedOut) {
      await step.run("store-ai-reply", async () => {
        return prisma.message.create({
          data: {
            conversationId,
            role: "AI",
            body: agentResult.reply,
            meta: { toolsExecuted: agentResult.toolsExecuted },
          },
        });
      });

      const updatedLead = await step.run("fetch-updated-lead", async () => {
        return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      });

      if (isWithinWhatsAppWindow(updatedLead.lastInboundAt)) {
        await step.run("send-whatsapp-reply", async () => {
          if (!updatedLead.phone) return { skipped: "no phone" };
          const sid = await sendFreeform(updatedLead.phone, agentResult.reply);
          return { sid };
        });
      } else {
        return { skipped: "outside 24h WhatsApp window" };
      }
    }

    if (agentResult.optedOut && agentResult.reply) {
      await step.run("send-optout-confirmation", async () => {
        if (!lead.phone) return;
        await sendFreeform(lead.phone, agentResult.reply);
      });
    }

    await step.run("update-lead-status", async () => {
      const updateData: Record<string, string> = {};
      if (lead.status === "CONTACTED" || lead.status === "NEW") {
        updateData["status"] = "ENGAGED";
      }
      if (agentResult.viewingBooked) {
        updateData["status"] = "VIEWING_BOOKED";
      }
      if (agentResult.escalated) {
        updateData["status"] = "HANDED_OFF";
      }

      if (Object.keys(updateData).length > 0) {
        return prisma.lead.update({
          where: { id: leadId },
          data: updateData as Parameters<typeof prisma.lead.update>[0]["data"],
        });
      }
    });

    await step.sendEvent("trigger-sf-sync", {
      name: "salesforce/sync",
      data: { leadId, conversationId },
    });

    return { agentResult };
  }
);

/**
 * Sync conversation outcome back to Salesforce.
 */
export const syncToSalesforce = inngest.createFunction(
  {
    id: "sync-to-salesforce",
    retries: 3,
    triggers: [{ event: "salesforce/sync" }],
  },
  async ({ event, step }: { event: any; step: any }) => {
    const leadId = event.data.leadId as string;
    const conversationId = event.data.conversationId as string;

    const lead = await step.run("fetch-lead", async () => {
      return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    });

    if (!lead.salesforceId) {
      return { skipped: "no Salesforce ID" };
    }

    const summary = await step.run("generate-summary", async () => {
      return summariseConversation(conversationId);
    });

    await step.run("sync-to-salesforce", async () => {
      return syncLeadToSalesforce({
        salesforceId: lead.salesforceId!,
        aiStatus: lead.status,
        qualification: lead.qualification as Record<string, string> | undefined,
        viewingBooked: lead.status === "VIEWING_BOOKED",
        optedOut: lead.optedOut,
        transcriptSummary: summary,
      });
    });

    return { summary };
  }
);

export const functions = [onLeadCreated, onMessageReceived, syncToSalesforce];
