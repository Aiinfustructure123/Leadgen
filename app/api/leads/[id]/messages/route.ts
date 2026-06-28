import { LeadStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import { isInsideWhatsAppCareWindow } from "@/lib/contact-hours";
import { appendMessage, getOrCreateConversation } from "@/lib/conversations";
import { prisma } from "@/lib/prisma";
import { sendFreeform } from "@/lib/whatsapp";

const manualMessageSchema = z.object({
  body: z.string().trim().min(1).max(1600)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payload = manualMessageSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid message body" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.optedOut) {
    return NextResponse.json({ error: "Lead has opted out." }, { status: 409 });
  }

  if (!lead.phone) {
    return NextResponse.json({ error: "Lead has no WhatsApp-capable phone number." }, { status: 409 });
  }

  if (!isInsideWhatsAppCareWindow(lead.lastInboundAt)) {
    return NextResponse.json(
      { error: "Outside the WhatsApp 24-hour care window. Use an approved template instead." },
      { status: 409 }
    );
  }

  const conversation = await getOrCreateConversation(lead.id);
  await prisma.conversation.update({ where: { id: conversation.id }, data: { handoff: true } });
  await prisma.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.HANDED_OFF } });

  const result = await sendFreeform(lead.phone, payload.data.body);
  await appendMessage({
    conversationId: conversation.id,
    role: Role.HUMAN,
    body: payload.data.body,
    providerMessageId: result.providerMessageId,
    meta: { provider: "twilio", skipped: result.skipped, reason: result.reason }
  });

  await inngest.send({
    name: "salesforce/sync",
    data: { leadId: lead.id }
  });

  return NextResponse.json({ ok: true, providerMessageId: result.providerMessageId, skipped: result.skipped });
}
