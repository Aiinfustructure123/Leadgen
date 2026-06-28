import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { ensureConversation } from "@/lib/leads";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ leadId: string }>;

export async function POST(_request: NextRequest, context: { params: Params }) {
  const user = await auth.protect();
  const { leadId } = await context.params;

  const conversation = await ensureConversation(leadId);

  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        handoff: true,
        handoffReason: `Manual takeover by ${user.userId}`,
        handedOffAt: new Date(),
      },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: {
        manualOverride: true,
        status: "HANDED_OFF",
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
