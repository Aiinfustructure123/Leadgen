/**
 * POST /api/webhooks/salesforce
 *
 * Receives new lead/enquiry notifications from Salesforce.
 * Expects an HMAC-SHA256 signature in the X-SF-Signature header.
 *
 * Expected Salesforce payload:
 * {
 *   salesforceId: string,
 *   firstName?: string,
 *   lastName?: string,
 *   email?: string,
 *   phone?: string,        // E.164
 *   enquiryType?: string,
 *   propertyRef?: string,
 *   source?: string
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/inngest/client";
import { verifySalesforceSignature } from "@/lib/salesforce";

// Rate-limit map: IP → request timestamps
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-sf-signature") ?? "";

  // Verify HMAC signature
  if (process.env.SF_WEBHOOK_SECRET) {
    const valid = verifySalesforceSignature(rawBody, signature);
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: Record<string, string>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { salesforceId, firstName, lastName, email, phone, enquiryType, propertyRef, source } =
    payload;

  if (!salesforceId) {
    return NextResponse.json({ error: "salesforceId is required" }, { status: 400 });
  }

  // Upsert lead (idempotent)
  const lead = await prisma.lead.upsert({
    where: { salesforceId },
    create: {
      salesforceId,
      firstName,
      lastName,
      email,
      phone,
      enquiryType,
      propertyRef,
      source,
      status: "NEW",
    },
    update: {
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      email: email ?? undefined,
      phone: phone ?? undefined,
      enquiryType: enquiryType ?? undefined,
      propertyRef: propertyRef ?? undefined,
      source: source ?? undefined,
    },
  });

  // Emit Inngest event to trigger outbound fan-out
  await inngest.send({
    name: "lead/created",
    data: { leadId: lead.id, salesforceId },
  });

  return NextResponse.json({ success: true, leadId: lead.id });
}
