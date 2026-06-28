import { inngest } from "../client";
import { prisma } from "../../db";
import { BUSINESS, SF_FIELDS } from "../../config";
import { summariseConversation } from "../../summary";
import { syncLeadToSalesforce } from "../../salesforce";
import { logger } from "../../logger";
import type { Qualification } from "../../qualification";

/**
 * Write the conversation summary + qualification + status back to Salesforce.
 * No-ops gracefully if the lead has no Salesforce id or SF isn't configured.
 */
export const syncToSalesforce = inngest.createFunction(
  { id: "sync-to-salesforce", name: "Sync to Salesforce", retries: 3 },
  { event: "lead/sync-salesforce" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return { skipped: "lead-not-found" };
    const conversation = await prisma.conversation.findFirst({
      where: { leadId, channel: "WHATSAPP" },
      orderBy: { createdAt: "desc" },
    });
    const messages = conversation
      ? await prisma.message.findMany({
          where: { conversationId: conversation.id },
          orderBy: { createdAt: "asc" },
        })
      : [];

    if (!lead.salesforceId) {
      logger.info("syncToSalesforce.no-sf-id", { leadId });
      return { skipped: "no-salesforce-id" };
    }
    if (!process.env.SF_CLIENT_ID) {
      logger.info("syncToSalesforce.not-configured", { leadId });
      return { skipped: "salesforce-not-configured" };
    }

    const summary = await step.run("summarise", async () => {
      return summariseConversation(messages);
    });

    await step.run("write-back", async () => {
      await syncLeadToSalesforce({
        salesforceId: lead.salesforceId!,
        aiStatus: lead.status,
        qualification: (lead.qualification as Qualification | null) ?? null,
        viewingBooked: lead.status === "VIEWING_BOOKED",
        optedOut: lead.optedOut,
        summary,
        transcriptUrl: `${BUSINESS.appUrl}/dashboard/leads/${lead.id}`,
      });
    });

    logger.info("syncToSalesforce.done", {
      leadId,
      fields: Object.values(SF_FIELDS),
    });
    return { synced: true };
  }
);
