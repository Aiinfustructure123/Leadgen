/**
 * POST /api/conversations/[conversationId]/messages
 * Allows the human consultant to send a message directly into the conversation.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { sendFreeform } from "@/lib/whatsapp";
import { isWithinWhatsAppWindow } from "@/lib/contact-hours";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;
  const { body } = await request.json();

  if (!body?.trim()) {
    return NextResponse.json({ error: "Message body required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { lead: true },
  });

  if (!conversation.handoff) {
    return NextResponse.json(
      { error: "Take over the conversation before sending human messages" },
      { status: 403 }
    );
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      role: "HUMAN",
      body,
      meta: { sentBy: userId },
    },
  });

  // Send via WhatsApp if within the 24h window
  if (conversation.lead.phone && isWithinWhatsAppWindow(conversation.lead.lastInboundAt)) {
    await sendFreeform(conversation.lead.phone, body);
  }

  return NextResponse.json(message);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(messages);
}
