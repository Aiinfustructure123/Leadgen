import { Channel, Prisma, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function getOrCreateConversation(leadId: string, channel: Channel = Channel.WHATSAPP) {
  const existing = await prisma.conversation.findFirst({
    where: { leadId, channel },
    orderBy: { createdAt: "desc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      leadId,
      channel
    }
  });
}

export async function appendMessage(input: {
  conversationId: string;
  role: Role;
  body: string;
  providerMessageId?: string;
  meta?: Prisma.InputJsonValue;
}) {
  return prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: input.role,
      body: input.body,
      providerMessageId: input.providerMessageId,
      meta: input.meta
    }
  });
}

export async function loadConversationWithMessages(conversationId: string) {
  return prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: true,
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });
}
