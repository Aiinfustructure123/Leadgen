import { inngest } from "../client";
import { prisma } from "../../db";
import { whatsapp } from "../../whatsapp";
import { email } from "../../email";
import { BUSINESS, requireEnv } from "../../config";
import { getOrCreateConversation, recordOutbound } from "../../messaging";
import { logger } from "../../logger";

/**
 * On a new lead: fan out in parallel to (1) WhatsApp intro template and
 * (2) personalised intro email. Set status -> CONTACTED.
 */
export const onLeadCreated = inngest.createFunction(
  { id: "on-lead-created", name: "On Lead Created — fan out", retries: 3 },
  { event: "lead/created" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    // Reads are idempotent; load directly so Prisma Date types are preserved
    // (step.run JSON-serializes return values, turning Dates into strings).
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });

    if (!lead) {
      logger.warn("onLeadCreated.lead-missing", { leadId });
      return { skipped: "lead-not-found" };
    }
    if (lead.optedOut) {
      logger.info("onLeadCreated.opted-out", { leadId });
      return { skipped: "opted-out" };
    }

    // 1) WhatsApp intro template (first contact must be a template).
    const whatsappStep = step.run("send-whatsapp-template", async () => {
      if (!lead.phone) return { skipped: "no-phone" };
      const templateSid = requireEnv("TWILIO_TEMPLATE_INTRO_SID");
      const vars = {
        "1": lead.firstName?.trim() || "there",
        "2": BUSINESS.consultantName,
        "3": lead.enquiryType || "your enquiry",
      };
      const result = await whatsapp.sendTemplate(lead.phone, templateSid, vars);
      const conversation = await getOrCreateConversation(lead.id);
      await recordOutbound({
        conversationId: conversation.id,
        leadId: lead.id,
        role: "AI",
        body: `[Intro template sent] Hi ${vars["1"]}, this is ${BUSINESS.consultantName}'s assistant at ${BUSINESS.companyName}…`,
        meta: { providerId: result.id, template: templateSid, vars },
      });
      return { sent: true, providerId: result.id };
    });

    // 2) Personalised intro email.
    const emailStep = step.run("send-intro-email", async () => {
      if (!lead.email) return { skipped: "no-email" };
      const result = await email.sendIntro(lead);
      return { sent: true, id: result.id };
    });

    const [whatsappResult, emailResult] = await Promise.all([
      whatsappStep,
      emailStep,
    ]);

    await step.run("mark-contacted", async () => {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "CONTACTED", lastOutboundAt: new Date() },
      });
    });

    // Schedule a stale-lead nudge check.
    await step.sendEvent("schedule-stale-check", {
      name: "lead/stale-check",
      data: { leadId },
    });

    return { whatsappResult, emailResult };
  }
);
