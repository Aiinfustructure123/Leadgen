import { prisma } from "@/lib/prisma";
import type { Channel, Conversation } from "@/generated/prisma";

/** Get the lead's active conversation for a channel, creating one if needed. */
export async function getOrCreateConversation(
  leadId: string,
  channel: Channel = "WHATSAPP",
): Promise<Conversation> {
  const existing = await prisma.conversation.findFirst({
    where: { leadId, channel },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { leadId, channel } });
}

/** Build a display name from a lead's name parts. */
export function leadDisplayName(lead: {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return name || lead.phone || lead.email || "Unknown lead";
}
