import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyHmac } from "@/lib/crypto";
import { requireEnv } from "@/lib/config";
import { recordWebhookEvent } from "@/lib/idempotency";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { inngest } from "@/lib/inngest/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Expected payload from the Salesforce Flow / Apex outbound callout. */
const PayloadSchema = z.object({
  salesforceId: z.string().min(1),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(), // E.164 expected
  enquiryType: z.string().optional().nullable(),
  propertyRef: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  eventId: z.string().optional().nullable(), // for idempotency
});

function normalizePhone(phone?: string | null): string | null {
  if (!phone) return null;
  const trimmed = phone.replace(/[\s()-]/g, "");
  if (trimmed.startsWith("+")) return trimmed;
  return trimmed; // assume caller sends E.164; leave as-is otherwise
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`sf:${ip}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await req.text();

  // Verify HMAC signature over the raw body.
  const signature =
    req.headers.get("x-onehomes-signature") ??
    req.headers.get("x-signature") ??
    null;
  let secret: string;
  try {
    secret = requireEnv("SF_WEBHOOK_SECRET");
  } catch {
    logger.error("salesforce.webhook.no-secret");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  if (!verifyHmac(rawBody, signature, secret)) {
    logger.warn("salesforce.webhook.bad-signature", { ip });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  // Parse + validate.
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;

  // Idempotency: dedupe by eventId if provided, else by salesforceId+payload.
  const dedupeKey = data.eventId || `lead:${data.salesforceId}`;
  const isFirst = await recordWebhookEvent("salesforce", dedupeKey);
  if (!isFirst) {
    logger.info("salesforce.webhook.duplicate", { dedupeKey });
    // Return 200 so Salesforce doesn't retry a duplicate.
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Upsert the Lead by salesforceId.
  const phone = normalizePhone(data.phone);
  const lead = await prisma.lead.upsert({
    where: { salesforceId: data.salesforceId },
    create: {
      salesforceId: data.salesforceId,
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      email: data.email ?? undefined,
      phone: phone ?? undefined,
      enquiryType: data.enquiryType ?? undefined,
      propertyRef: data.propertyRef ?? undefined,
      source: data.source ?? undefined,
      status: "NEW",
    },
    update: {
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      email: data.email ?? undefined,
      phone: phone ?? undefined,
      enquiryType: data.enquiryType ?? undefined,
      propertyRef: data.propertyRef ?? undefined,
      source: data.source ?? undefined,
    },
  });

  logger.info("salesforce.webhook.lead-upserted", {
    leadId: lead.id,
    salesforceId: lead.salesforceId,
  });

  // Only fan out for genuinely new leads (status NEW) to avoid re-messaging.
  if (lead.status === "NEW" && !lead.optedOut) {
    await inngest.send({ name: "lead/created", data: { leadId: lead.id } });
  }

  return NextResponse.json({ ok: true, leadId: lead.id });
}
