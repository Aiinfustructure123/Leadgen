import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { sendTemplate, whatsappConfigured, isWithinWindow } from "@/lib/whatsapp";
import { getOrCreateConversation } from "@/lib/leads";
import { withinContactHours } from "@/lib/contactHours";

/**
 * Optional: nudge leads who were contacted but never replied. Scheduled by
 * emitting `lead/stale-check` (e.g. from onLeadCreated with a delay, or a cron).
 *
 * Because the lead never opened a 24h window, any nudge MUST be an approved
 * template — never free-form. We also respect contact hours.
 */
export const staleLeadNudge = inngest.createFunction(
  { id: "stale-lead-nudge", retries: 2 },
  { event: "lead/stale-check" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await step.run("load-lead", async () => {
      return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    });

    if (lead.optedOut) return { skipped: "opted-out" };
    if (lead.status !== "CONTACTED") return { skipped: `status-${lead.status}` };
    // If they already messaged us, the window is open and other flows handle it.
    if (isWithinWindow(lead.lastInboundAt)) return { skipped: "already-engaged" };
    if (!withinContactHours()) return { skipped: "outside-contact-hours" };
    if (!lead.phone || !whatsappConfigured() || !config.whatsapp.introTemplateSid) {
      return { skipped: "not-sendable" };
    }

    await step.run("send-nudge-template", async () => {
      const res = await sendTemplate(lead.phone!, config.whatsapp.introTemplateSid, {
        "1": lead.firstName ?? "there",
        "2": config.consultant.name,
        "3": lead.enquiryType ?? "your enquiry",
      });
      const conversation = await getOrCreateConversation(leadId, "WHATSAPP");
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "AI",
          body: "[Follow-up template sent]",
          providerId: res.providerId,
          meta: { kind: "template", followUp: true },
        },
      });
      logger.info("staleLeadNudge.sent", { leadId });
    });

    return { leadId, nudged: true };
  },
);
