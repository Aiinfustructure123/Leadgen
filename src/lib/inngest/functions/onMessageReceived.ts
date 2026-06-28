import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logger } from "@/lib/logger";
import { runAgent } from "@/lib/agent";
import {
  sendFreeform,
  isWithinWindow,
  whatsappConfigured,
} from "@/lib/whatsapp";

/**
 * On an inbound lead message: run the agent loop, then send its reply via
 * WhatsApp (free-form is allowed because the lead just messaged us, opening the
 * 24h window). Finally request a Salesforce sync.
 */
export const onMessageReceived = inngest.createFunction(
  { id: "on-message-received", retries: 2, concurrency: { key: "event.data.leadId", limit: 1 } },
  { event: "message/received" },
  async ({ event, step }) => {
    const { leadId, conversationId } = event.data;

    const state = await step.run("load-state", async () => {
      const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      const conversation = await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      return { lead, conversation };
    });

    // Respect opt-out and human handoff — the AI must stay silent.
    if (state.lead.optedOut) {
      logger.info("onMessageReceived.skip.optedout", { leadId });
      return { skipped: "opted-out" };
    }
    if (state.conversation.handoff) {
      logger.info("onMessageReceived.skip.handoff", { leadId });
      return { skipped: "handed-off" };
    }

    const result = await step.run("run-agent", async () => {
      return runAgent({ leadId, conversationId });
    });

    const sendResult = await step.run("send-reply", async () => {
      const reply = result.reply?.trim();
      if (!reply) return { skipped: "no-reply" };
      if (!state.lead.phone) return { skipped: "no-phone" };
      if (!whatsappConfigured()) return { skipped: "whatsapp-not-configured" };

      // Free-form requires the 24h window to be open. It should be, since the
      // lead just messaged, but we re-check defensively.
      const fresh = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
      if (!isWithinWindow(fresh.lastInboundAt)) {
        logger.warn("onMessageReceived.window-closed", { leadId });
        return { skipped: "window-closed" };
      }

      const res = await sendFreeform(fresh.phone!, reply);
      await prisma.message.create({
        data: {
          conversationId,
          role: "AI",
          body: reply,
          providerId: res.providerId,
          meta: {
            toolCalls: result.toolCalls,
            effects: result.effects,
          } as unknown as Prisma.InputJsonValue,
        },
      });
      return { sent: true, providerId: res.providerId };
    });

    // Reflect terminal states on the lead status where appropriate.
    await step.run("apply-effects", async () => {
      const updates: Record<string, unknown> = {};
      if (result.effects.optedOut) updates.status = "OPTED_OUT";
      else if (result.effects.handedOff) updates.status = "HANDED_OFF";
      else if (result.effects.viewingBooked) updates.status = "VIEWING_BOOKED";
      if (Object.keys(updates).length > 0) {
        await prisma.lead.update({ where: { id: leadId }, data: updates });
      }
    });

    // Fire-and-forget sync to Salesforce (its own retryable function).
    await step.sendEvent("request-sync", {
      name: "lead/sync-requested",
      data: { leadId },
    });

    return { leadId, sendResult, effects: result.effects };
  },
);
