import { LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { env } from "@/lib/config";
import { ensureConversation } from "@/lib/leads";
import { inngest } from "@/lib/inngest/client";
import { prisma } from "@/lib/prisma";
import { limitRequest } from "@/lib/rate-limit";
import { payloadHash, verifyHmacSignature } from "@/lib/signatures";
import { normalizePhone } from "@/lib/time";

const payloadSchema = z.object({
  eventId: z.string().optional(),
  salesforceId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  enquiryType: z.string().optional(),
  propertyRef: z.string().optional(),
  source: z.string().optional(),
  consentSource: z.string().optional(),
  salesforceUrl: z.string().url().optional(),
});

function getRequestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  const limiter = limitRequest(`sf:${getRequestIp(request)}`, {
    max: 100,
    windowMs: 60_000,
  });

  if (!limiter.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const raw = await request.text();
  const signature = request.headers.get("x-salesforce-signature");
  const verified = verifyHmacSignature({
    payload: raw,
    signature,
    secret: env.SF_WEBHOOK_SECRET,
  });

  if (!verified) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const body = payloadSchema.safeParse(parsedRaw);
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid payload", details: body.error.flatten() },
      { status: 400 },
    );
  }

  const externalId =
    body.data.eventId ||
    request.headers.get("x-salesforce-event-id") ||
    body.data.salesforceId ||
    payloadHash(raw);

  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "salesforce",
        externalId,
        payloadHash: payloadHash(raw),
      },
    });
  } catch {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const phone = normalizePhone(body.data.phone);
  const lead = await prisma.lead.upsert({
    where: body.data.salesforceId
      ? { salesforceId: body.data.salesforceId }
      : { phone: phone ?? `missing-${externalId}` },
    create: {
      salesforceId: body.data.salesforceId,
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      email: body.data.email,
      phone,
      enquiryType: body.data.enquiryType,
      propertyRef: body.data.propertyRef,
      source: body.data.source,
      consentSource: body.data.consentSource ?? "salesforce-enquiry",
      salesforceUrl: body.data.salesforceUrl,
      status: LeadStatus.NEW,
    },
    update: {
      firstName: body.data.firstName,
      lastName: body.data.lastName,
      email: body.data.email,
      phone,
      enquiryType: body.data.enquiryType,
      propertyRef: body.data.propertyRef,
      source: body.data.source,
      consentSource: body.data.consentSource ?? undefined,
      salesforceUrl: body.data.salesforceUrl,
      status: LeadStatus.NEW,
    },
  });

  await ensureConversation(lead.id);

  await inngest.send({
    name: "lead/created",
    data: {
      leadId: lead.id,
      sourceEventId: externalId,
    },
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}
