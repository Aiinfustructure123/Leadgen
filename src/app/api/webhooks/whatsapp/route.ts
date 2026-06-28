import { LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/config";
import { ensureConversation } from "@/lib/leads";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";
import { payloadHash } from "@/lib/signatures";
import { normalizePhone, shouldOptOut } from "@/lib/time";
import { sendFreeform, verifyTwilioSignature } from "@/lib/whatsapp";

function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  const limiter = limitRequest(`wa:${getRequestIp(request)}`, {
    max: 240,
    windowMs: 60_000,
  });
  if (!limiter.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const formData = await request.formData();
  const params = Object.fromEntries(
    Array.from(formData.entries()).map(([key, value]) => [key, String(value)]),
  );

  const signature = request.headers.get("x-twilio-signature");
  const verified = verifyTwilioSignature({
    signature,
    url: request.url,
    params,
  });

  if (!verified && env.TWILIO_AUTH_TOKEN) {
    return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 });
  }

  const body = params.Body?.trim() ?? "";
  const from = normalizePhone(params.From);
  const messageSid = params.MessageSid ?? payloadHash(JSON.stringify(params));

  if (!from) {
    return NextResponse.json({ error: "Missing From number" }, { status: 400 });
  }

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "twilio",
        externalId: messageSid,
        payloadHash: payloadHash(JSON.stringify(params)),
      },
    });
  } catch {
    return NextResponse.json({ ok: true, deduped: true });
  }

  let lead = await prisma.lead.findUnique({
    where: { phone: from },
  });

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        phone: from,
        source: "whatsapp-inbound",
        consentSource: "whatsapp-inbound",
        status: LeadStatus.NEW,
      },
    });
  }

  const conversation = await ensureConversation(lead.id);
  const inboundMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "LEAD",
      body,
      provider: "twilio",
      providerId: messageSid,
      meta: {
        profileName: params.ProfileName ?? null,
      },
    },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: new Date(),
      status: lead.status === LeadStatus.CONTACTED ? LeadStatus.ENGAGED : lead.status,
    },
  });

  if (shouldOptOut(body)) {
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { optedOut: true, status: LeadStatus.OPTED_OUT },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          handoff: true,
          handoffReason: "Lead opted out",
          handedOffAt: new Date(),
        },
      }),
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: "SYSTEM",
          body: "Lead sent an opt-out keyword.",
          meta: { keyword: body },
        },
      }),
    ]);

    if (env.TWILIO_AUTH_TOKEN && env.TWILIO_ACCOUNT_SID && env.TWILIO_WHATSAPP_FROM) {
      try {
        await sendFreeform(
          from,
          "Confirmed — you have been opted out from One Homes messages. Reply START if you want to hear from us again.",
        );
      } catch {
        // Best-effort confirmation only.
      }
    }

    await inngest.send({
      name: "salesforce/sync",
      data: { leadId: lead.id, conversationId: conversation.id },
    });

    return NextResponse.json({ ok: true, optedOut: true });
  }

  await inngest.send({
    name: "message/received",
    data: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: inboundMessage.id,
    },
  });

  return NextResponse.json({ ok: true });
}
