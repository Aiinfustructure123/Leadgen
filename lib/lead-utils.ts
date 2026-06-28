import type { Lead, Message } from "@prisma/client";

export function leadDisplayName(lead: Pick<Lead, "firstName" | "lastName" | "email" | "phone">): string {
  const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return fullName || lead.email || lead.phone || "Unknown lead";
}

export function leadFirstName(lead: Pick<Lead, "firstName" | "email" | "phone">): string {
  return lead.firstName || lead.email?.split("@")[0] || lead.phone || "there";
}

export function formatQualification(qualification: unknown): string {
  if (!qualification || typeof qualification !== "object") {
    return "No qualification captured yet.";
  }

  return Object.entries(qualification as Record<string, unknown>)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("\n");
}

export function transcriptText(messages: Pick<Message, "role" | "body" | "createdAt">[]): string {
  return messages
    .map((message) => {
      const timestamp = message.createdAt.toISOString();
      return `[${timestamp}] ${message.role}: ${message.body}`;
    })
    .join("\n");
}
