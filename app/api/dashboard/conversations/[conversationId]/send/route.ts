import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { appendMessage } from "@/lib/leads";
import { sendFreeform } from "@/lib/whatsapp";

const sendSchema = z.object({
  body: z.string().trim().min(1).max(1600),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const parsed = sendSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { lead: true },
  });

  if (!conversation.lead.phone) {
    return NextResponse.json({ error: "Lead has no WhatsApp phone number." }, { status: 400 });
  }

  if (conversation.lead.optedOut) {
    return NextResponse.json({ error: "Lead has opted out." }, { status: 400 });
  }

  const result = await sendFreeform(conversation.lead.phone, parsed.data.body, {
    lastInboundAt: conversation.lead.lastInboundAt,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { handoff: true },
  });

  const message = await appendMessage({
    conversationId,
    role: "HUMAN",
    body: parsed.data.body,
    meta: { sentBy: userId },
    providerMessageId: result.providerMessageId,
  });

  return NextResponse.json({ ok: true, messageId: message.id });
}
