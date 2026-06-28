import { LeadStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { getOrCreateConversation, appendMessage } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const conversation = await getOrCreateConversation(lead.id);
  await prisma.$transaction([
    prisma.conversation.updateMany({
      where: { leadId: lead.id },
      data: { handoff: true }
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { status: LeadStatus.HANDED_OFF }
    })
  ]);

  await appendMessage({
    conversationId: conversation.id,
    role: Role.SYSTEM,
    body: "Consultant took over the conversation. AI replies are paused.",
    meta: { action: "takeover" }
  });

  return NextResponse.json({ ok: true });
}
