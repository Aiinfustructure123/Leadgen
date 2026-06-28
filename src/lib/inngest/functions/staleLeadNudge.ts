import { inngest } from "../client";
import { prisma } from "../../db";
import { logger } from "../../logger";
import { isWithinContactHours, nextContactWindowOpen } from "../../hours";
import { isWithinWhatsAppWindow } from "../../messaging";

const NUDGE_DELAY = "4h";

/**
 * If a contacted lead hasn't replied within N hours, and policy allows, queue
 * an approved follow-up template. Honours contact hours and opt-out.
 *
 * NOTE: Free-form follow-ups are NOT allowed outside the 24h window — only
 * pre-approved templates. Wire TWILIO_TEMPLATE_FOLLOWUP_SID before enabling
 * an actual send; by default we record a SYSTEM note for the consultant.
 */
export const staleLeadNudge = inngest.createFunction(
  { id: "stale-lead-nudge", name: "Stale Lead Nudge", retries: 1 },
  { event: "lead/stale-check" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    await step.sleep("wait-before-nudge", NUDGE_DELAY);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead) return { skipped: "lead-not-found" };
    if (lead.optedOut) return { skipped: "opted-out" };
    if (lead.lastInboundAt) return { skipped: "lead-already-replied" };
    if (["HANDED_OFF", "OPTED_OUT", "DEAD"].includes(lead.status)) {
      return { skipped: `status-${lead.status}` };
    }

    // Respect contact hours: if outside, sleep until the window opens.
    if (!isWithinContactHours()) {
      const open = nextContactWindowOpen();
      await step.sleepUntil("wait-for-contact-hours", open);
    }

    // Since the lead never replied, we're outside the 24h care window — a
    // free-form send is not permitted. Record a note prompting a template.
    await step.run("record-nudge-note", async () => {
      const conversation = await prisma.conversation.findFirst({
        where: { leadId, channel: "WHATSAPP" },
        orderBy: { createdAt: "desc" },
      });
      if (!conversation) return;
      const insideWindow = isWithinWhatsAppWindow(lead);
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "SYSTEM",
          body: insideWindow
            ? "[Stale nudge] Lead inside 24h window but silent — consider a gentle follow-up."
            : "[Stale nudge] Lead silent and outside 24h window — send an approved follow-up TEMPLATE (TWILIO_TEMPLATE_FOLLOWUP_SID).",
        },
      });
    });

    logger.info("staleLeadNudge.noted", { leadId });
    return { noted: true };
  }
);
