import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { ensureConversation } from "@/lib/leads";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ leadId: string }>;

export async function POST(_request: NextRequest, context: { params: Params }) {
  await auth.protect();
  const { leadId } = await context.params;
  const conversation = await ensureConversation(leadId);

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: {
        optedOut: true,
        status: "OPTED_OUT",
      },
    }),
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        handoff: true,
        handoffReason: "Manual opt-out by consultant",
        handedOffAt: new Date(),
      },
    }),
    prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "SYSTEM",
        body: "Lead manually opted out by consultant.",
      },
    }),
  ]);

  await inngest.send({
    name: "salesforce/sync",
    data: {
      leadId,
      conversationId: conversation.id,
    },
  });

  return NextResponse.json({ ok: true });
}
