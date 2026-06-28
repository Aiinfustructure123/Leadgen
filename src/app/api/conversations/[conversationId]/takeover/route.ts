/**
 * POST /api/conversations/[conversationId]/takeover
 * Sets handoff=true on the conversation, pausing AI replies.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { conversationId } = await params;

  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: { handoff: true },
    include: { lead: true },
  });

  await prisma.lead.update({
    where: { id: conversation.leadId },
    data: { status: "HANDED_OFF" },
  });

  await prisma.message.create({
    data: {
      conversationId,
      role: "SYSTEM",
      body: "Conversation taken over by human consultant",
      meta: { takenOverBy: userId },
    },
  });

  // Trigger Salesforce sync
  await inngest.send({
    name: "salesforce/sync",
    data: { leadId: conversation.leadId, conversationId },
  });

  return NextResponse.json({ success: true, handoff: true });
}
