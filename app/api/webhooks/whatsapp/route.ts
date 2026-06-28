import { NextResponse } from "next/server";

import { inngest } from "@/lib/inngest";
import {
  appendMessage,
  getOrCreateConversation,
  getOrCreateLeadByPhone,
  isOptOutMessage,
  markOptedOut,
  storeWebhookEvent,
} from "@/lib/leads";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, verifyTwilioSignature } from "@/lib/security";
import { sendFreeform, toE164FromWhatsAppAddress } from "@/lib/whatsapp";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  if (!rateLimit(`whatsapp:${getClientIp(request)}`, { limit: 180, windowMs: 60_000 })) {
    return twiml({ status: 429 });
  }

  const body = await request.text();
  const params = Object.fromEntries(new URLSearchParams(body).entries());

  if (!verifyTwilioSignature(request, params)) {
    return twiml({ status: 401 });
  }

  const messageSid = params.MessageSid || params.SmsMessageSid;
  const from = toE164FromWhatsAppAddress(params.From);
  const messageBody = params.Body?.trim() || "";

  if (!messageSid || !from) {
    return twiml({ status: 400 });
  }

  const event = await storeWebhookEvent("twilio-whatsapp", messageSid, params);

  if (event.duplicate) {
    return twiml();
  }

  const lead = await getOrCreateLeadByPhone(from);
  const conversation = await getOrCreateConversation(lead.id, "WHATSAPP");

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: new Date(),
      status: lead.status === "NEW" || lead.status === "CONTACTED" ? "ENGAGED" : lead.status,
    },
  });

  await appendMessage({
    conversationId: conversation.id,
    role: "LEAD",
    body: messageBody,
    meta: {
      from: params.From,
      profileName: params.ProfileName,
      waId: params.WaId,
    },
    providerMessageId: messageSid,
  });

  if (isOptOutMessage(messageBody)) {
    await markOptedOut(lead.id);
    const confirmation =
      "Understood - you have been opted out and will not receive further WhatsApp messages from One Homes.";
    const result = await sendFreeform(from, confirmation, { lastInboundAt: new Date() });

    await appendMessage({
      conversationId: conversation.id,
      role: "AI",
      body: confirmation,
      meta: { optOutConfirmation: true },
      providerMessageId: result.providerMessageId,
    });

    await inngest.send({
      name: "salesforce/sync",
      data: { leadId: lead.id, conversationId: conversation.id },
    });

    return twiml();
  }

  await inngest.send({
    name: "message/received",
    data: { leadId: lead.id, conversationId: conversation.id, messageId: messageSid },
  });

  return twiml();
}

function twiml(init?: ResponseInit) {
  return new NextResponse("<Response></Response>", {
    ...init,
    headers: {
      "content-type": "text/xml",
      ...init?.headers,
    },
  });
}
