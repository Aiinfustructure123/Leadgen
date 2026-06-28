import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

export async function POST(
  _request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const { conversationId } = await context.params;
  const conversation = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      handoff: true,
      lead: {
        update: { status: "HANDED_OFF" },
      },
      messages: {
        create: {
          role: "SYSTEM",
          body: `Human takeover enabled by Clerk user ${userId}.`,
        },
      },
    },
  });

  return NextResponse.json({ ok: true, conversationId: conversation.id });
}
