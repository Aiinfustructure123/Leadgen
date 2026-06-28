import { inngest } from "../client";
import { prisma } from "../../db";
import { logger } from "../../logger";
import { runAgent } from "../../agent";
import { sendFreeformReply, recordOutbound } from "../../messaging";
import { mergeQualification, type Qualification } from "../../qualification";
import { BUSINESS } from "../../config";
import { notifyConsultant } from "../../notify";
import type { Prisma } from "@prisma/client";

/**
 * Core agent loop. On each inbound WhatsApp message: load lead + history, run
 * Claude with tools, apply effects (qualification, opt-out, escalation,
 * viewing), send the reply, and trigger a Salesforce sync.
 */
export const onMessageReceived = inngest.createFunction(
  { id: "on-message-received", name: "On Message Received — agent loop", retries: 2 },
  { event: "message/received" },
  async ({ event, step }) => {
    const { leadId, conversationId } = event.data;

    // Reads are idempotent; load directly so Prisma Date types are preserved
    // (step.run JSON-serializes return values, turning Dates into strings).
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });

    if (!lead || !conversation) {
      logger.warn("onMessageReceived.missing", { leadId, conversationId });
      return { skipped: "missing-lead-or-conversation" };
    }

    // Don't let the AI respond if a human has taken over or lead opted out.
    if (conversation.handoff) {
      logger.info("onMessageReceived.handoff-active", { leadId });
      return { skipped: "handoff-active" };
    }
    if (lead.optedOut) {
      logger.info("onMessageReceived.opted-out", { leadId });
      return { skipped: "opted-out" };
    }

    // Run the agent (Claude + tools). Not wrapped in step.run because the SDK
    // call is the unit of work; Inngest retry re-runs the whole function.
    const agentResult = await runAgent(lead, messages);

    // Apply qualification updates.
    if (
      agentResult.effects.qualificationUpdate &&
      Object.keys(agentResult.effects.qualificationUpdate).length > 0
    ) {
      await step.run("update-qualification", async () => {
        const merged = mergeQualification(
          lead.qualification as Qualification | null,
          agentResult.effects.qualificationUpdate!
        );
        await prisma.lead.update({
          where: { id: leadId },
          data: { qualification: merged },
        });
      });
    }

    // Handle opt-out.
    if (agentResult.effects.optedOut) {
      await step.run("apply-optout", async () => {
        await prisma.lead.update({
          where: { id: leadId },
          data: { optedOut: true, status: "OPTED_OUT" },
        });
      });
    }

    // Handle escalation.
    if (agentResult.effects.escalated) {
      await step.run("apply-escalation", async () => {
        await prisma.$transaction([
          prisma.conversation.update({
            where: { id: conversationId },
            data: { handoff: true },
          }),
          prisma.lead.update({
            where: { id: leadId },
            data: { status: "HANDED_OFF" },
          }),
          prisma.message.create({
            data: {
              conversationId,
              role: "SYSTEM",
              body: `[Escalated to ${BUSINESS.consultantName}] ${agentResult.effects.escalationReason ?? ""}`,
            },
          }),
        ]);
      });
      await step.run("notify-consultant", async () => {
        await notifyConsultant({
          lead,
          reason: agentResult.effects.escalationReason ?? "Escalation requested",
        });
      });
    }

    // Viewing booked / status progression.
    if (agentResult.effects.viewingBooked) {
      await step.run("mark-viewing-booked", async () => {
        await prisma.lead.update({
          where: { id: leadId },
          data: { status: "VIEWING_BOOKED" },
        });
      });
    } else if (
      !agentResult.effects.optedOut &&
      !agentResult.effects.escalated &&
      agentResult.effects.statusHint
    ) {
      await step.run("apply-status-hint", async () => {
        // Only advance status forward sensibly.
        const order: Record<string, number> = {
          NEW: 0,
          CONTACTED: 1,
          ENGAGED: 2,
          QUALIFIED: 3,
          VIEWING_BOOKED: 4,
          HANDED_OFF: 5,
        };
        const current = order[lead.status] ?? 0;
        const hint = order[agentResult.effects.statusHint!] ?? 0;
        if (hint > current) {
          await prisma.lead.update({
            where: { id: leadId },
            data: { status: agentResult.effects.statusHint! },
          });
        }
      });
    } else {
      // At minimum, an inbound reply means the lead is ENGAGED.
      if (lead.status === "CONTACTED" || lead.status === "NEW") {
        await step.run("mark-engaged", async () => {
          await prisma.lead.update({
            where: { id: leadId },
            data: { status: "ENGAGED" },
          });
        });
      }
    }

    // Send the reply (respecting 24h window + opt-out).
    let sendResult: unknown = { skipped: "no-reply" };
    if (agentResult.reply.trim()) {
      // Reload lead to pick up optedOut just applied.
      const freshLead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (freshLead && !freshLead.optedOut) {
        sendResult = await sendFreeformReply({
          lead: freshLead,
          conversation,
          role: "AI",
          body: agentResult.reply,
          toolMeta: agentResult.toolCalls as unknown as Prisma.InputJsonValue,
        });
      } else if (freshLead?.optedOut) {
        // Still log the polite opt-out confirmation as the final send.
        sendResult = await sendFreeformReply({
          lead: { ...freshLead, optedOut: false },
          conversation,
          role: "AI",
          body: agentResult.reply,
        });
      }
    } else if (agentResult.toolCalls.length > 0) {
      await recordOutbound({
        conversationId,
        leadId,
        role: "SYSTEM",
        body: `[Tool-only turn] ${agentResult.toolCalls.map((t) => t.name).join(", ")}`,
      });
    }

    // Trigger Salesforce write-back.
    await step.sendEvent("trigger-sf-sync", {
      name: "lead/sync-salesforce",
      data: { leadId },
    });

    return { reply: agentResult.reply, toolCalls: agentResult.toolCalls, sendResult };
  }
);
