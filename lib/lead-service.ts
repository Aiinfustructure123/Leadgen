import { LeadStatus, Role, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type QualificationUpdate = {
  budget?: string;
  beds?: string;
  location?: string;
  timeline?: string;
  buyerType?: string;
  financing?: string;
  viewingInterest?: string;
};

export async function getOrCreatePrimaryConversation(leadId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { leadId },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      leadId,
    },
  });
}

export async function appendMessage({
  conversationId,
  role,
  body,
  channel = "WHATSAPP",
  providerMessageId,
  meta,
}: {
  conversationId: string;
  role: Role;
  body: string;
  channel?: "WHATSAPP" | "EMAIL";
  providerMessageId?: string;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
    data: {
      conversationId,
      role,
      body,
      channel,
      providerMessageId,
      meta,
    },
  });
}

export async function updateLeadQualification(leadId: string, fields: QualificationUpdate) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { qualification: true, status: true },
  });

  const merged = {
    ...((lead?.qualification as Record<string, unknown> | null) ?? {}),
    ...fields,
  };

  return prisma.lead.update({
    where: { id: leadId },
    data: {
      qualification: merged,
      status: lead?.status === LeadStatus.CONTACTED ? LeadStatus.ENGAGED : undefined,
      lastActivityAt: new Date(),
    },
  });
}

export async function setLeadOptedOut(leadId: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      optedOut: true,
      status: LeadStatus.OPTED_OUT,
      lastActivityAt: new Date(),
    },
  });
}

export async function setConversationHandoff(conversationId: string, reason: string) {
  return prisma.conversation.update({
    where: { id: conversationId },
    data: {
      handoff: true,
      handoffReason: reason,
    },
  });
}
