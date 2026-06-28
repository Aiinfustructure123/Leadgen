import { LeadStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/inngest/client";
import { env } from "@/lib/config";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { clientIp, verifyHmacSignature } from "@/lib/security";

const salesforceLeadPayload = z.object({
  salesforceId: z.string().min(1),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  enquiryType: z.string().optional().nullable(),
  propertyRef: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  consentSource: z.string().optional().nullable()
});

export async function POST(request: Request) {
  if (!rateLimit(`salesforce:${clientIp(request)}`, 120, 60_000)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-onehomes-signature") ?? request.headers.get("x-salesforce-signature");

  if (!verifyHmacSignature(rawBody, signature, env("SF_WEBHOOK_SECRET"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = salesforceLeadPayload.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }

  const payload = parsed.data;
  const existing = await prisma.lead.findUnique({
    where: { salesforceId: payload.salesforceId }
  });

  const lead = await prisma.lead.upsert({
    where: { salesforceId: payload.salesforceId },
    update: {
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      enquiryType: payload.enquiryType,
      propertyRef: payload.propertyRef,
      source: payload.source,
      consentSource: payload.consentSource ?? payload.source
    },
    create: {
      salesforceId: payload.salesforceId,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
      phone: payload.phone,
      enquiryType: payload.enquiryType,
      propertyRef: payload.propertyRef,
      source: payload.source,
      consentSource: payload.consentSource ?? payload.source,
      status: LeadStatus.NEW
    }
  });

  if (!existing && !lead.optedOut) {
    await inngest.send({
      name: "lead/created",
      data: {
        leadId: lead.id,
        salesforceId: lead.salesforceId
      }
    });
  }

  return NextResponse.json({ ok: true, leadId: lead.id, deduped: Boolean(existing) });
}
