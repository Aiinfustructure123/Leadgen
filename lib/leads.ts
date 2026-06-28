import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

export type SalesforceLeadPayload = {
  id?: string;
  salesforceId?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  enquiryType?: string;
  propertyRef?: string;
  source?: string;
  consentSource?: string;
};

export async function upsertLeadFromSalesforce(payload: SalesforceLeadPayload) {
  const salesforceId = payload.salesforceId || payload.id;
  const names = splitName(payload.name);
  const data = {
    salesforceId,
    firstName: payload.firstName || names.firstName,
    lastName: payload.lastName || names.lastName,
    email: payload.email,
    phone: normalizePhone(payload.phone),
    enquiryType: payload.enquiryType,
    propertyRef: payload.propertyRef,
    source: payload.source,
    consentSource: payload.consentSource || "Salesforce enquiry",
  };

  if (salesforceId) {
    return prisma.lead.upsert({
      where: { salesforceId },
      create: data,
      update: data,
    });
  }

  return prisma.lead.create({ data });
}

export async function getOrCreateLeadByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const existing = await prisma.lead.findFirst({ where: { phone: normalized } });

  if (existing) {
    return existing;
  }

  return prisma.lead.create({
    data: {
      phone: normalized,
      source: "WhatsApp inbound",
      consentSource: "Inbound WhatsApp message",
      status: "ENGAGED",
      lastInboundAt: new Date(),
    },
  });
}

export async function getOrCreateConversation(leadId: string, channel: "WHATSAPP" | "EMAIL" = "WHATSAPP") {
  const existing = await prisma.conversation.findFirst({
    where: { leadId, channel },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      leadId,
      channel,
    },
  });
}

export async function storeWebhookEvent(provider: string, externalId: string, payload?: Prisma.InputJsonValue) {
  const existing = await prisma.webhookEvent.findUnique({
    where: {
      provider_externalId: {
        provider,
        externalId,
      },
    },
  });

  if (existing) {
    return { duplicate: true as const, event: existing };
  }

  const event = await prisma.webhookEvent.create({
    data: {
      provider,
      externalId,
      payload,
    },
  });

  return { duplicate: false as const, event };
}

export async function appendMessage({
  conversationId,
  role,
  body,
  meta,
  providerMessageId,
}: {
  conversationId: string;
  role: "LEAD" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  meta?: Prisma.InputJsonValue;
  providerMessageId?: string;
}) {
  return prisma.message.create({
    data: {
      conversationId,
      role,
      body,
      meta,
      providerMessageId,
    },
  });
}

export async function mergeQualification(leadId: string, fields: Record<string, unknown>) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId } });
  const existing =
    lead.qualification && typeof lead.qualification === "object" && !Array.isArray(lead.qualification)
      ? (lead.qualification as Record<string, unknown>)
      : {};

  const qualification = JSON.parse(JSON.stringify({ ...existing, ...fields })) as Prisma.InputJsonValue;

  return prisma.lead.update({
    where: { id: leadId },
    data: {
      qualification,
    },
  });
}

export async function markOptedOut(leadId: string) {
  return prisma.lead.update({
    where: { id: leadId },
    data: {
      optedOut: true,
      status: "OPTED_OUT",
    },
  });
}

export function isOptOutMessage(body: string): boolean {
  return /^(stop|unsubscribe|opt\s*out|do not contact|don't contact|remove me)\b/i.test(body.trim());
}

function normalizePhone(phone?: string | null): string | undefined {
  if (!phone) {
    return undefined;
  }

  return phone.replace(/^whatsapp:/, "").replace(/[^\d+]/g, "");
}

function splitName(name?: string): { firstName?: string; lastName?: string } {
  if (!name) {
    return {};
  }

  const [firstName, ...rest] = name.trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" ") || undefined,
  };
}
