import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateConversation } from "@/lib/leads";

export const dynamic = "force-dynamic";

/** Toggle human handoff. When taking over, the AI stops replying. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { handoff?: boolean };
  const handoff = body.handoff ?? true;

  const conversation = await getOrCreateConversation(id, "WHATSAPP");
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { handoff },
  });

  await prisma.lead.update({
    where: { id },
    data: handoff ? { status: "HANDED_OFF" } : {},
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "SYSTEM",
      body: handoff
        ? "Consultant took over the conversation. AI paused."
        : "Consultant returned the conversation to the AI.",
      meta: { handoff },
    },
  });

  logger.info("dashboard.takeover", { leadId: id, handoff });
  return NextResponse.json({ ok: true, handoff });
}
