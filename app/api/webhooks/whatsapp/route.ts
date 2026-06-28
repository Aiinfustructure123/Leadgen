import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import { Role } from "@prisma/client";

import { SECURITY_CONFIG } from "@/lib/config";
import { requireEnv } from "@/lib/env";
import { inngest } from "@/lib/inngest";
import { appendMessage, getOrCreatePrimaryConversation, setLeadOptedOut } from "@/lib/lead-service";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const STOP_WORDS = ["stop", "unsubscribe", "end", "quit", "cancel"];

function getClientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

function normalizePhone(input?: string | null) {
  if (!input) {
    return "";
  }
  return input.replace("whatsapp:", "").trim();
}

function verifyTwilioRequest(request: NextRequest, params: Record<string, string>) {
  const signature = request.headers.get("x-twilio-signature");
  if (!signature) {
    return false;
  }

  const url = request.url;
  return twilio.validateRequest(requireEnv("TWILIO_AUTH_TOKEN"), signature, url, params);
}

function isStopMessage(body: string) {
  const normalized = body.toLowerCase().trim();
  return STOP_WORDS.some((word) => normalized === word || normalized.includes(word));
}

export async function POST(request: NextRequest) {
  const limit = rateLimit({
    key: `twilio:${getClientIp(request)}`,
    limit: SECURITY_CONFIG.webhookRateLimitPerMinute,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const form = await request.formData();
  const params = Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, String(value)]),
  );

  if (!verifyTwilioRequest(request, params)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid;
  const from = normalizePhone(params.From);
  const body = params.Body?.trim() ?? "";

  if (!messageSid || !from || !body) {
    return NextResponse.json({ error: "Missing required Twilio params" }, { status: 400 });
  }

  const duplicate = await prisma.webhookEvent.findUnique({
    where: {
      source_externalId: {
        source: "twilio_whatsapp",
        externalId: messageSid,
      },
    },
  });
  if (duplicate) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  const lead = await prisma.lead.findFirst({
    where: {
      phone: {
        in: [from, `+${from.replace(/^\+/, "")}`],
      },
    },
  });

  if (!lead) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });
  }

  const conversation = await getOrCreatePrimaryConversation(lead.id);
  const inbound = await appendMessage({
    conversationId: conversation.id,
    role: Role.LEAD,
    body,
    providerMessageId: messageSid,
    meta: { provider: "twilio" },
  });

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      lastInboundAt: new Date(),
      lastActivityAt: new Date(),
    },
  });

  await prisma.webhookEvent.create({
    data: {
      source: "twilio_whatsapp",
      externalId: messageSid,
      payload: params,
      leadId: lead.id,
    },
  });

  if (isStopMessage(body)) {
    await setLeadOptedOut(lead.id);
    await appendMessage({
      conversationId: conversation.id,
      role: Role.SYSTEM,
      body: "Lead requested opt-out via WhatsApp STOP keyword.",
    });
    await inngest.send({
      name: "lead/sync.requested",
      data: {
        leadId: lead.id,
        reason: "stop_keyword",
      },
    });
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You are unsubscribed from One Homes messages. Reply START to opt back in.</Message></Response>',
      {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      },
    );
  }

  await inngest.send({
    name: "message/received",
    data: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: inbound.id,
    },
  });

  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}
