import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { salesforceConfigured, syncLeadToSalesforce } from "@/lib/salesforce";
import { summariseConversation } from "@/lib/agent/summary";

/**
 * Write the conversation transcript summary + qualification/status fields back
 * to Salesforce. Skips gracefully if SF isn't configured or the lead has no SF id.
 */
export const syncToSalesforce = inngest.createFunction(
  { id: "sync-to-salesforce", retries: 4 },
  { event: "lead/sync-requested" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await step.run("load-lead", async () => {
      return prisma.lead.findUniqueOrThrow({
        where: { id: leadId },
        include: { conversations: { include: { messages: { orderBy: { createdAt: "asc" } } } } },
      });
    });

    if (!salesforceConfigured()) {
      logger.info("syncToSalesforce.skip.not-configured", { leadId });
      return { skipped: "salesforce-not-configured" };
    }
    if (!lead.salesforceId) {
      logger.info("syncToSalesforce.skip.no-sfid", { leadId });
      return { skipped: "no-salesforce-id" };
    }

    const allMessages = lead.conversations.flatMap((c) => c.messages);
    const handoff = lead.conversations.some((c) => c.handoff);

    const summary = await step.run("summarise", async () => {
      return summariseConversation(allMessages.map((m) => ({ role: m.role, body: m.body })));
    });

    await step.run("write-back", async () => {
      await syncLeadToSalesforce({
        salesforceId: lead.salesforceId!,
        summary,
        transcriptUrl: `${config.appUrl}/dashboard/leads/${lead.id}`,
        aiStatus: lead.status,
        qualification: lead.qualification as Record<string, unknown> | null,
        viewingBooked: lead.status === "VIEWING_BOOKED",
        optedOut: lead.optedOut,
        aiHandled: !handoff,
      });
    });

    return { leadId, synced: true };
  },
);
