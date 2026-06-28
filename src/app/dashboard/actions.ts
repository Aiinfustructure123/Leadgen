"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  getOrCreateConversation,
  sendFreeformReply,
} from "@/lib/messaging";
import { inngest } from "@/lib/inngest/client";
import { BUSINESS } from "@/lib/config";
import type { LeadStatus } from "@prisma/client";

/** Human consultant takes over: pause AI, mark handoff. */
export async function takeOver(leadId: string) {
  const conversation = await getOrCreateConversation(leadId);
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: { handoff: true },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: { status: "HANDED_OFF" },
    }),
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "SYSTEM",
        body: `[${BUSINESS.consultantName} took over the conversation]`,
      },
    }),
  ]);
  await inngest.send({ name: "lead/sync-salesforce", data: { leadId } });
  revalidatePath(`/dashboard/leads/${leadId}`);
}

/** Hand control back to the AI. */
export async function resumeAi(leadId: string) {
  const conversation = await getOrCreateConversation(leadId);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { handoff: false },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "SYSTEM",
      body: "[AI assistant resumed the conversation]",
    },
  });
  revalidatePath(`/dashboard/leads/${leadId}`);
}

/** Consultant sends a free-form message in the thread. */
export async function sendHumanMessage(leadId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "empty" };

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, error: "lead-not-found" };
  if (lead.optedOut) return { ok: false, error: "opted-out" };

  const conversation = await getOrCreateConversation(leadId);
  const result = await sendFreeformReply({
    lead,
    conversation,
    role: "HUMAN",
    body: trimmed,
  });
  await inngest.send({ name: "lead/sync-salesforce", data: { leadId } });
  revalidatePath(`/dashboard/leads/${leadId}`);
  return { ok: result.sent, error: result.sent ? undefined : result.reason };
}

/** Manual status override. */
export async function setStatus(leadId: string, status: LeadStatus) {
  await prisma.lead.update({ where: { id: leadId }, data: { status } });
  await inngest.send({ name: "lead/sync-salesforce", data: { leadId } });
  revalidatePath(`/dashboard/leads/${leadId}`);
}

/** Manual opt-out from the dashboard. */
export async function manualOptOut(leadId: string) {
  await prisma.lead.update({
    where: { id: leadId },
    data: { optedOut: true, status: "OPTED_OUT" },
  });
  const conversation = await getOrCreateConversation(leadId);
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "SYSTEM",
      body: "[Manually opted out by consultant]",
    },
  });
  await inngest.send({ name: "lead/sync-salesforce", data: { leadId } });
  revalidatePath(`/dashboard/leads/${leadId}`);
}
