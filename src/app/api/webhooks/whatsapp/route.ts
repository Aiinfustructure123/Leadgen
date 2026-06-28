import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";
import { rateLimit, clientIp } from "@/lib/rateLimit";
import { OPT_OUT_KEYWORDS, config } from "@/lib/config";
import {
  verifyTwilioSignature,
  sendFreeform,
  whatsappConfigured,
} from "@/lib/whatsapp";
import { getOrCreateConversation } from "@/lib/leads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Twilio expects a TwiML/XML 200 response; empty <Response/> means "no auto-reply".
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
function twiml() {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`wa:${ip}`, 120, 60_000).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody)) as Record<string, string>;

  // Verify Twilio signature against the exact public URL it called.
  const signature = req.headers.get("x-twilio-signature");
  const url = publicUrl(req);
  if (whatsappConfigured()) {
    if (!verifyTwilioSignature(signature, url, params)) {
      logger.warn("webhook.whatsapp.bad-signature", { ip, url });
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  } else {
    logger.warn("webhook.whatsapp.unverified", { reason: "twilio-not-configured" });
  }

  const from = (params.From ?? "").replace(/^whatsapp:/, "").trim();
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? params.SmsMessageSid ?? "";

  if (!from) return twiml();

  const lead = await prisma.lead.findFirst({
    where: { phone: from },
    orderBy: { createdAt: "desc" },
  });
  if (!lead) {
    logger.warn("webhook.whatsapp.unknown-sender", { from });
    return twiml();
  }

  const conversation = await getOrCreateConversation(lead.id, "WHATSAPP");

  // Idempotency: skip if we've already stored this MessageSid.
  if (messageSid) {
    const existing = await prisma.message.findUnique({ where: { providerId: messageSid } });
    if (existing) {
      logger.info("webhook.whatsapp.duplicate", { messageSid });
      return twiml();
    }
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "LEAD",
      body: body || "[non-text message]",
      providerId: messageSid || null,
      meta: { numMedia: params.NumMedia, profileName: params.ProfileName },
    },
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastInboundAt: new Date() },
  });

  // Opt-out detection takes priority over the agent.
  if (isOptOut(body)) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { optedOut: true, status: "OPTED_OUT" },
    });
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "SYSTEM",
        body: "Lead opted out via STOP keyword.",
        meta: { optOut: true },
      },
    });
    if (whatsappConfigured()) {
      try {
        const confirmation = `You're now unsubscribed and won't receive further messages from ${config.consultant.company}. If you change your mind, just message us again.`;
        const res = await sendFreeform(from, confirmation);
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "AI",
            body: confirmation,
            providerId: res.providerId,
            meta: { optOutConfirmation: true },
          },
        });
      } catch (err) {
        logger.error("webhook.whatsapp.optout-confirm-failed", { err });
      }
    }
    await inngest.send({ name: "lead/sync-requested", data: { leadId: lead.id } });
    logger.info("webhook.whatsapp.optout", { leadId: lead.id });
    return twiml();
  }

  if (lead.optedOut) {
    logger.info("webhook.whatsapp.ignored-optedout", { leadId: lead.id });
    return twiml();
  }

  // Hand off to the agent pipeline.
  const inboundMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, role: "LEAD" },
    orderBy: { createdAt: "desc" },
  });

  await inngest.send({
    name: "message/received",
    data: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: inboundMessage?.id ?? "",
    },
  });
  logger.info("webhook.whatsapp.received", { leadId: lead.id });

  return twiml();
}

function isOptOut(body: string): boolean {
  const normalised = body.toLowerCase().trim().replace(/[.!]/g, "");
  return OPT_OUT_KEYWORDS.some(
    (kw) => normalised === kw || normalised.startsWith(`${kw} `),
  );
}

/** Reconstruct the public URL Twilio used, honouring proxy headers. */
function publicUrl(req: Request): string {
  const configured = process.env.TWILIO_WEBHOOK_URL;
  if (configured) return configured;
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const u = new URL(req.url);
    return `${proto}://${host}${u.pathname}${u.search}`;
  }
  return req.url;
}
