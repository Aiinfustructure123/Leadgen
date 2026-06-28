import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { inngest } from "@/lib/inngest";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp, verifySalesforceSignature } from "@/lib/security";
import { storeWebhookEvent, upsertLeadFromSalesforce } from "@/lib/leads";

const salesforcePayloadSchema = z.object({
  id: z.string().optional(),
  salesforceId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  enquiryType: z.string().optional(),
  propertyRef: z.string().optional(),
  source: z.string().optional(),
  consentSource: z.string().optional(),
});

export async function POST(request: Request) {
  if (!rateLimit(`salesforce:${getClientIp(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-onehomes-signature");

  if (!verifySalesforceSignature(body, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const parsed = salesforcePayloadSchema.safeParse(JSON.parse(body));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const externalId = parsed.data.salesforceId || parsed.data.id || hashBody(body);
  const event = await storeWebhookEvent("salesforce", externalId, parsed.data);

  if (event.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const lead = await upsertLeadFromSalesforce({
    ...parsed.data,
    email: parsed.data.email || undefined,
  });

  await inngest.send({
    name: "lead/created",
    data: { leadId: lead.id, salesforceId: lead.salesforceId },
  });

  return NextResponse.json({ ok: true, leadId: lead.id });
}

function hashBody(body: string): string {
  return crypto.createHash("sha256").update(body).digest("hex");
}
