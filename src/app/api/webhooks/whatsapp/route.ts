/**
 * POST /api/webhooks/whatsapp
 *
 * Receives inbound WhatsApp messages from Twilio.
 * Twilio sends form-encoded data with an X-Twilio-Signature header.
 *
 * Key fields from Twilio:
 *   From    — whatsapp:+44...
 *   Body    — message text
 *   MessageSid
 *   AccountSid
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { verifyTwilioSignature } from "@/lib/whatsapp";

// Rate-limit map
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

const OPT_OUT_PHRASES = ["stop", "unsubscribe", "opt out", "optout", "cancel", "quit"];

function isOptOut(body: string): boolean {
  const lower = body.toLowerCase().trim();
  return OPT_OUT_PHRASES.some((p) => lower === p || lower.startsWith(p + " "));
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  if (isRateLimited(ip)) {
    return new NextResponse("Rate limit exceeded", { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-twilio-signature") ?? "";

  // Build the full URL Twilio signed (must match exactly what Twilio used)
  const url =
    process.env.NEXT_PUBLIC_BASE_URL
      ? `${process.env.NEXT_PUBLIC_BASE_URL}/api/webhooks/whatsapp`
      : request.url;

  // Parse form-encoded body
  const params = Object.fromEntries(new URLSearchParams(rawBody));

  // Verify Twilio signature in production
  if (process.env.TWILIO_AUTH_TOKEN) {
    const valid = verifyTwilioSignature(url, params, signature);
    if (!valid) {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  }

  const from = params["From"]; // e.g. "whatsapp:+447123456789"
  const body = params["Body"] ?? "";
  const messageSid = params["MessageSid"];

  if (!from) {
    return new NextResponse("Missing From field", { status: 400 });
  }

  // Normalise phone to E.164
  const phone = from.replace("whatsapp:", "");

  // Find lead by phone number
  const lead = await prisma.lead.findFirst({
    where: { phone },
    include: { conversations: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!lead) {
    // Unknown sender — ignore gracefully
    return new NextResponse("", { status: 200 });
  }

  // Check for opt-out
  if (isOptOut(body)) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { status: "OPTED_OUT", optedOut: true },
    });

    // Send Inngest event so agent can send confirmation and log to SF
    // (we pass a special flag via the message)
    const conv =
      lead.conversations[0] ??
      (await prisma.conversation.create({
        data: { leadId: lead.id, channel: "WHATSAPP" },
      }));

    const msg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        role: "LEAD",
        body,
        meta: { messageSid, optout: true },
      },
    });

    await inngest.send({
      name: "message/received",
      data: { leadId: lead.id, conversationId: conv.id, messageId: msg.id },
    });

    return new NextResponse("", { status: 200 });
  }

  // Opted-out leads — acknowledge but don't process
  if (lead.optedOut) {
    return new NextResponse("", { status: 200 });
  }

  // Update last inbound timestamp (opens/extends 24h window)
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastInboundAt: new Date() },
  });

  // Get or create conversation
  let conversation = lead.conversations[0];
  if (!conversation || conversation.handoff) {
    // If handoff is true, still store the message but don't trigger AI
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { leadId: lead.id, channel: "WHATSAPP" },
      });
    }
  }

  // Store inbound message
  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "LEAD",
      body,
      meta: { messageSid },
    },
  });

  // Don't trigger agent if conversation is handed off
  if (!conversation.handoff && !lead.optedOut) {
    await inngest.send({
      name: "message/received",
      data: {
        leadId: lead.id,
        conversationId: conversation.id,
        messageId: message.id,
      },
    });
  }

  return new NextResponse("", { status: 200 });
}
