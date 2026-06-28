import { Channel, LeadStatus, Role } from "@prisma/client";
import { NextResponse } from "next/server";

import { inngest } from "@/inngest/client";
import { isOptOutText } from "@/lib/ai";
import { appendMessage, getOrCreateConversation } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/security";
import { sendFreeform, stripWhatsAppPrefix, verifyTwilioWebhook } from "@/lib/whatsapp";

export async function POST(request: Request) {
  if (!rateLimit(`whatsapp:${clientIp(request)}`, 240, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const form = await request.formData();
  const verified = await verifyTwilioWebhook(request, form);
  if (!verified) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
  }

  const providerMessageId = String(form.get("MessageSid") ?? "");
  const from = stripWhatsAppPrefix(String(form.get("From") ?? ""));
  const body = String(form.get("Body") ?? "").trim();

  if (!providerMessageId || !from || !body) {
    return NextResponse.json({ error: "Missing required WhatsApp fields" }, { status: 400 });
  }

  const existingMessage = await prisma.message.findUnique({ where: { providerMessageId } });
  if (existingMessage) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  let lead = await prisma.lead.findUnique({ where: { phone: from } });
  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        phone: from,
        source: "whatsapp_inbound",
        consentSource: "Inbound WhatsApp message",
        status: LeadStatus.ENGAGED,
        lastInboundAt: new Date()
      }
    });
  } else {
    lead = await prisma.lead.update({
      where: { id: lead.id },
      data: {
        lastInboundAt: new Date(),
        status: lead.optedOut ? lead.status : LeadStatus.ENGAGED
      }
    });
  }

  const conversation = await getOrCreateConversation(lead.id, Channel.WHATSAPP);
  await appendMessage({
    conversationId: conversation.id,
    role: Role.LEAD,
    body,
    providerMessageId,
    meta: {
      provider: "twilio",
      from,
      raw: Object.fromEntries(Array.from(form.entries()).map(([key, value]) => [key, String(value)]))
    }
  });

  if (isOptOutText(body)) {
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { optedOut: true, status: LeadStatus.OPTED_OUT }
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { handoff: true }
      })
    ]);

    const confirmation = "Of course - you have been opted out and we will not contact you further.";
    const sendResult = await sendFreeform(from, confirmation);
    await appendMessage({
      conversationId: conversation.id,
      role: Role.AI,
      body: confirmation,
      providerMessageId: sendResult.providerMessageId,
      meta: { optOutConfirmation: true, skipped: sendResult.skipped }
    });

    await inngest.send({
      name: "salesforce/sync",
      data: { leadId: lead.id }
    });

    return NextResponse.json({ ok: true, optOut: true });
  }

  await inngest.send({
    name: "message/received",
    data: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: providerMessageId
    }
  });

  return NextResponse.json({ ok: true, leadId: lead.id, conversationId: conversation.id });
}
