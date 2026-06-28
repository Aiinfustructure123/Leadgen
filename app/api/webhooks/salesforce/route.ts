import { NextRequest, NextResponse } from "next/server";
import { LeadStatus } from "@prisma/client";
import { z } from "zod";

import { SECURITY_CONFIG } from "@/lib/config";
import { inngest } from "@/lib/inngest";
import { getOrCreatePrimaryConversation } from "@/lib/lead-service";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { verifySalesforceSignature } from "@/lib/webhook-signatures";

const SalesforcePayloadSchema = z.object({
  eventId: z.string(),
  salesforceId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  enquiryType: z.string().optional(),
  propertyRef: z.string().optional(),
  source: z.string().optional(),
  consentSource: z.string().optional(),
});

function clientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) {
    return "unknown";
  }
  return forwarded.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: NextRequest) {
  const limit = rateLimit({
    key: `sf:${clientIp(request)}`,
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

  const signature =
    request.headers.get(SECURITY_CONFIG.webhookSignatureHeader) ??
    request.headers.get("x-signature") ??
    "";

  const raw = await request.text();
  if (!signature || !verifySalesforceSignature({ payload: raw, signature })) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payloadJson: unknown;
  try {
    payloadJson = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
  }

  const parsed = SalesforcePayloadSchema.safeParse(payloadJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existingEvent = await prisma.webhookEvent.findUnique({
    where: {
      source_externalId: {
        source: "salesforce",
        externalId: parsed.data.eventId,
      },
    },
  });

  if (existingEvent) {
    return NextResponse.json({ deduped: true });
  }

  const mutation = {
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    enquiryType: parsed.data.enquiryType,
    propertyRef: parsed.data.propertyRef,
    source: parsed.data.source,
    consentSource: parsed.data.consentSource ?? parsed.data.source ?? "salesforce-enquiry",
    status: LeadStatus.NEW,
    lastActivityAt: new Date(),
  };

  const lead = parsed.data.salesforceId
    ? await prisma.lead.upsert({
        where: { salesforceId: parsed.data.salesforceId },
        update: mutation,
        create: {
          ...mutation,
          salesforceId: parsed.data.salesforceId,
        },
      })
    : await upsertLeadWithoutSalesforceId(mutation);

  await prisma.webhookEvent.create({
    data: {
      source: "salesforce",
      externalId: parsed.data.eventId,
      payload: parsed.data,
      leadId: lead.id,
    },
  });

  await getOrCreatePrimaryConversation(lead.id);

  await inngest.send({
    name: "lead/created",
    data: {
      leadId: lead.id,
      sourceEventId: parsed.data.eventId,
    },
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}

async function upsertLeadWithoutSalesforceId(
  mutation: Omit<
    Parameters<typeof prisma.lead.create>[0]["data"],
    "id" | "createdAt" | "updatedAt" | "conversations" | "inboundEvents"
  >,
) {
  const orWhere: Array<{ email?: string; phone?: string }> = [];
  if (typeof mutation.email === "string" && mutation.email.trim()) {
    orWhere.push({ email: mutation.email });
  }
  if (typeof mutation.phone === "string" && mutation.phone.trim()) {
    orWhere.push({ phone: mutation.phone });
  }

  const existing = await prisma.lead.findFirst({
    where: orWhere.length > 0 ? { OR: orWhere } : undefined,
  });

  if (existing) {
    return prisma.lead.update({
      where: { id: existing.id },
      data: mutation,
    });
  }

  return prisma.lead.create({
    data: mutation,
  });
}
