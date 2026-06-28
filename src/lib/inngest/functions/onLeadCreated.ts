import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getOrCreateConversation } from "@/lib/leads";
import {
  sendTemplate,
  whatsappConfigured,
} from "@/lib/whatsapp";
import { sendIntro, emailConfigured } from "@/lib/email";

/**
 * On a new lead: fan out to WhatsApp (approved template) + intro email in
 * parallel, then mark the lead CONTACTED. Each side-effect is its own step so
 * Inngest retries them independently without re-sending the other.
 */
export const onLeadCreated = inngest.createFunction(
  { id: "on-lead-created", retries: 3 },
  { event: "lead/created" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await step.run("load-lead", async () => {
      return prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
    });

    if (lead.optedOut) {
      logger.info("onLeadCreated.skip.optedout", { leadId });
      return { skipped: "opted-out" };
    }

    const conversation = await step.run("ensure-conversation", async () => {
      return getOrCreateConversation(leadId, "WHATSAPP");
    });

    // --- WhatsApp intro template ---
    const whatsappResult = await step.run("send-whatsapp-template", async () => {
      if (!lead.phone) return { skipped: "no-phone" };
      if (!whatsappConfigured() || !config.whatsapp.introTemplateSid) {
        return { skipped: "whatsapp-not-configured" };
      }
      const res = await sendTemplate(lead.phone, config.whatsapp.introTemplateSid, {
        "1": lead.firstName ?? "there",
        "2": config.consultant.name,
        "3": lead.enquiryType ?? "your enquiry",
      });
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "AI",
          body: `[Intro template sent: ${config.whatsapp.introTemplateSid}]`,
          providerId: res.providerId,
          meta: { kind: "template", templateSid: config.whatsapp.introTemplateSid },
        },
      });
      return { sent: true, providerId: res.providerId };
    });

    // --- Intro email ---
    const emailResult = await step.run("send-intro-email", async () => {
      if (!lead.email) return { skipped: "no-email" };
      if (!emailConfigured()) return { skipped: "email-not-configured" };
      const res = await sendIntro(lead);
      return { sent: true, providerId: res.providerId };
    });

    await step.run("mark-contacted", async () => {
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: lead.status === "NEW" ? "CONTACTED" : lead.status },
      });
    });

    return { leadId, whatsappResult, emailResult };
  },
);
