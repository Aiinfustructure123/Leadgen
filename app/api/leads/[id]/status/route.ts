import { LeadStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import { appendMessage, getOrCreateConversation } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";

const statusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
  optedOut: z.boolean().optional()
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = statusSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid status payload" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const optedOut = payload.data.optedOut ?? payload.data.status === LeadStatus.OPTED_OUT;
  const status = optedOut ? LeadStatus.OPTED_OUT : payload.data.status;
  const conversation = await getOrCreateConversation(lead.id);

  await prisma.lead.update({
    where: { id: lead.id },
    data: { status, optedOut }
  });

  if (optedOut) {
    await prisma.conversation.updateMany({ where: { leadId: lead.id }, data: { handoff: true } });
  }

  await appendMessage({
    conversationId: conversation.id,
    role: Role.SYSTEM,
    body: `Manual lead status update: ${status}${optedOut ? " (opted out)" : ""}.`,
    meta: { action: "manual_status_update", status, optedOut }
  });

  await inngest.send({
    name: "salesforce/sync",
    data: { leadId: lead.id }
  });

  return NextResponse.json({ ok: true, status, optedOut });
}
