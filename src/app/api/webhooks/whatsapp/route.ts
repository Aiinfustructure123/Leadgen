import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { whatsapp, fromWhatsAppAddress } from "@/lib/whatsapp";
import { recordWebhookEvent } from "@/lib/idempotency";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { isOptOut } from "@/lib/optout";
import {
  getOrCreateConversation,
  recordInbound,
  sendFreeformReply,
} from "@/lib/messaging";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";
import { BUSINESS } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reconstruct the public URL Twilio signed against. */
function reconstructUrl(req: Request): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const url = new URL(req.url);
  if (host) return `${proto}://${host}${url.pathname}${url.search}`;
  return req.url;
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`wa:${ip}`, 180, 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Twilio sends application/x-www-form-urlencoded.
  const rawBody = await req.text();
  const form = new URLSearchParams(rawBody);
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = v;

  // Verify Twilio signature.
  const signature = req.headers.get("x-twilio-signature");
  const url = reconstructUrl(req);
  const validSignature =
    signature && whatsapp.validateSignature(signature, url, params);
  if (!validSignature) {
    logger.warn("whatsapp.webhook.bad-signature", { ip });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  const messageSid = params.MessageSid || params.SmsMessageSid || "";
  const from = params.From ? fromWhatsAppAddress(params.From) : "";
  const body = (params.Body ?? "").trim();

  if (!from) {
    return NextResponse.json({ error: "missing_from" }, { status: 400 });
  }

  // Idempotency on Twilio MessageSid.
  const isFirst = await recordWebhookEvent("twilio", messageSid);
  if (!isFirst) {
    logger.info("whatsapp.webhook.duplicate", { messageSid });
    return twimlOk();
  }

  // Find the lead by phone (E.164). Twilio `From` includes country code.
  const lead = await prisma.lead.findFirst({
    where: { phone: from },
    orderBy: { createdAt: "desc" },
  });

  if (!lead) {
    // Unknown sender — log and acknowledge (don't auto-create to avoid spam).
    logger.warn("whatsapp.webhook.unknown-sender", { from });
    return twimlOk();
  }

  const conversation = await getOrCreateConversation(lead.id);

  // Record the inbound message + open the 24h window.
  await recordInbound({
    conversationId: conversation.id,
    leadId: lead.id,
    body,
    meta: { messageSid, provider: "twilio" },
  });

  // Opt-out short-circuit — handle immediately, deterministically.
  if (isOptOut(body)) {
    logger.info("whatsapp.webhook.optout", { leadId: lead.id });
    await prisma.lead.update({
      where: { id: lead.id },
      data: { optedOut: true, status: "OPTED_OUT" },
    });
    // We're inside the 24h window (they just messaged), so a free-form
    // confirmation is allowed. Send once, then nothing further.
    const refreshed = await prisma.lead.findUnique({ where: { id: lead.id } });
    if (refreshed) {
      await sendFreeformReply({
        lead: { ...refreshed, optedOut: false }, // allow this single confirmation
        conversation,
        role: "AI",
        body: `You're all set — I won't message you again. If you ever change your mind, just reply here or contact ${BUSINESS.consultantName} at ${BUSINESS.companyName}. Take care.`,
      });
    }
    await inngest.send({ name: "lead/sync-salesforce", data: { leadId: lead.id } });
    return twimlOk();
  }

  // Hand off to the agent loop via Inngest (don't block the webhook).
  const inbound = await prisma.message.findFirst({
    where: { conversationId: conversation.id, role: "LEAD" },
    orderBy: { createdAt: "desc" },
  });
  await inngest.send({
    name: "message/received",
    data: {
      leadId: lead.id,
      conversationId: conversation.id,
      messageId: inbound?.id ?? "",
    },
  });

  return twimlOk();
}

/** Twilio expects a 200 with (optionally empty) TwiML. */
function twimlOk() {
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}
