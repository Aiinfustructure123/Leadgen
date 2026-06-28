import { LeadStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function ensureConversation(leadId: string) {
  const existing = await prisma.conversation.findFirst({
    where: { leadId, channel: "WHATSAPP" },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      leadId,
      channel: "WHATSAPP",
    },
  });
}

export function mergeQualification(
  current: Prisma.JsonValue | null,
  update: Record<string, unknown>,
) {
  const existing = (current && typeof current === "object" ? current : {}) as Record<string, unknown>;
  return {
    ...existing,
    ...Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== undefined && value !== null && value !== ""),
    ),
  } as Prisma.InputJsonValue;
}

export function deriveLeadStatus(args: {
  optedOut: boolean;
  handoff: boolean;
  hasQualification: boolean;
  viewingBooked?: boolean;
}) {
  if (args.optedOut) return LeadStatus.OPTED_OUT;
  if (args.handoff) return LeadStatus.HANDED_OFF;
  if (args.viewingBooked) return LeadStatus.VIEWING_BOOKED;
  if (args.hasQualification) return LeadStatus.QUALIFIED;
  return LeadStatus.ENGAGED;
}
