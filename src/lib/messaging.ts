import { prisma } from "./db";
import { WHATSAPP } from "./config";
import { whatsapp } from "./whatsapp";
import { logger } from "./logger";
import type { Conversation, Lead, Prisma } from "@prisma/client";

/** Is the lead inside the 24h WhatsApp customer-care window? */
export function isWithinWhatsAppWindow(
  lead: Pick<Lead, "lastInboundAt">,
  now: Date = new Date()
): boolean {
  if (!lead.lastInboundAt) return false;
  return now.getTime() - lead.lastInboundAt.getTime() < WHATSAPP.windowMs;
}

/** Record an inbound (LEAD) message and bump lastInboundAt. */
export async function recordInbound(params: {
  conversationId: string;
  leadId: string;
  body: string;
  meta?: Prisma.InputJsonValue;
  at?: Date;
}) {
  const at = params.at ?? new Date();
  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "LEAD",
        body: params.body,
        meta: params.meta,
      },
    }),
    prisma.lead.update({
      where: { id: params.leadId },
      data: { lastInboundAt: at },
    }),
  ]);
  return message;
}

/** Record an outbound message (AI/HUMAN/SYSTEM) and bump lastOutboundAt. */
export async function recordOutbound(params: {
  conversationId: string;
  leadId: string;
  role: "AI" | "HUMAN" | "SYSTEM";
  body: string;
  meta?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: params.role,
      body: params.body,
      meta: params.meta,
    },
  });
  if (params.role !== "SYSTEM") {
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { lastOutboundAt: new Date() },
    });
  }
  return message;
}

export type FreeformSendResult =
  | { sent: true; providerId: string }
  | { sent: false; reason: "outside_window" | "no_phone" | "opted_out" };

/**
 * Send a free-form AI/human reply over WhatsApp, but ONLY if inside the 24h
 * window and the lead hasn't opted out. Records the Message either way.
 */
export async function sendFreeformReply(params: {
  lead: Lead;
  conversation: Conversation;
  role: "AI" | "HUMAN";
  body: string;
  toolMeta?: Prisma.InputJsonValue;
}): Promise<FreeformSendResult> {
  const { lead, conversation, role, body } = params;

  if (lead.optedOut) {
    logger.warn("messaging.blocked.optedout", { leadId: lead.id });
    return { sent: false, reason: "opted_out" };
  }
  if (!lead.phone) {
    return { sent: false, reason: "no_phone" };
  }
  if (!isWithinWhatsAppWindow(lead)) {
    // Outside the window: cannot free-form. Record a SYSTEM note so the
    // consultant/dashboard knows a template follow-up is required.
    await recordOutbound({
      conversationId: conversation.id,
      leadId: lead.id,
      role: "SYSTEM",
      body: `[Not sent — outside 24h window] ${body}`,
    });
    logger.warn("messaging.blocked.window", { leadId: lead.id });
    return { sent: false, reason: "outside_window" };
  }

  const result = await whatsapp.sendFreeform(lead.phone, body);
  await recordOutbound({
    conversationId: conversation.id,
    leadId: lead.id,
    role,
    body,
    meta: { providerId: result.id, provider: result.provider, ...(params.toolMeta ? { tools: params.toolMeta } : {}) },
  });
  return { sent: true, providerId: result.id };
}

/** Get or create the active WhatsApp conversation for a lead. */
export async function getOrCreateConversation(leadId: string): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { leadId, channel: "WHATSAPP" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.conversation.create({
    data: { leadId, channel: "WHATSAPP" },
  });
}
