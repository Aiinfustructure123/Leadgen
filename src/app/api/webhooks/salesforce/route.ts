import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";
import { verifySalesforceSignature } from "@/lib/salesforce";
import { rateLimit, clientIp } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Expected payload from the Salesforce Flow outbound callout. */
const payloadSchema = z.object({
  salesforceId: z.string().min(1),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  enquiryType: z.string().optional().nullable(),
  propertyRef: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  // Salesforce may send its own event id for idempotency; fall back to record id.
  eventId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`sf:${ip}`, 60, 60_000).allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const rawBody = await req.text();
  const signature =
    req.headers.get("x-onehomes-signature") ?? req.headers.get("x-signature");

  if (!verifySalesforceSignature(rawBody, signature)) {
    logger.warn("webhook.salesforce.bad-signature", { ip });
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    logger.warn("webhook.salesforce.invalid", { issues: parsed.error.issues });
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // Idempotency: dedupe on the Salesforce event/record id.
  const externalId = data.eventId || data.salesforceId;
  try {
    await prisma.webhookEvent.create({
      data: { source: "salesforce", externalId },
    });
  } catch {
    logger.info("webhook.salesforce.duplicate", { externalId });
    return NextResponse.json({ ok: true, deduped: true });
  }

  const phone = normalisePhone(data.phone);

  const lead = await prisma.lead.upsert({
    where: { salesforceId: data.salesforceId },
    create: {
      salesforceId: data.salesforceId,
      firstName: data.firstName ?? null,
      lastName: data.lastName ?? null,
      email: data.email ?? null,
      phone,
      enquiryType: data.enquiryType ?? null,
      propertyRef: data.propertyRef ?? null,
      source: data.source ?? null,
      status: "NEW",
    },
    update: {
      // Refresh contact details but never resurrect an opted-out lead.
      firstName: data.firstName ?? undefined,
      lastName: data.lastName ?? undefined,
      email: data.email ?? undefined,
      phone: phone ?? undefined,
      enquiryType: data.enquiryType ?? undefined,
      propertyRef: data.propertyRef ?? undefined,
      source: data.source ?? undefined,
    },
  });

  if (lead.optedOut) {
    logger.info("webhook.salesforce.optedout-skip", { leadId: lead.id });
    return NextResponse.json({ ok: true, leadId: lead.id, skipped: "opted-out" });
  }

  await inngest.send({ name: "lead/created", data: { leadId: lead.id } });
  logger.info("webhook.salesforce.lead-created", { leadId: lead.id });

  return NextResponse.json({ ok: true, leadId: lead.id });
}

/** Keep only digits and a leading +, producing a best-effort E.164 string. */
function normalisePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  if (!cleaned) return null;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}
