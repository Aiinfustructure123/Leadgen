import jsforce from "jsforce";

import { getAppBaseUrl, getEnv, optionalEnv, SALESFORCE_FIELDS } from "@/lib/config";
import type { Lead, Message } from "@/generated/prisma/client";

type ConversationForSync = {
  id: string;
  messages: Message[];
};

export async function syncConversationToSalesforce({
  lead,
  conversation,
  summary,
}: {
  lead: Lead;
  conversation: ConversationForSync;
  summary: string;
}) {
  if (!lead.salesforceId) {
    return { skipped: true as const, reason: "Lead has no Salesforce id." };
  }

  const connection = await getSalesforceConnection();
  const transcriptUrl = getTranscriptUrl(lead.id);
  const description = [
    summary,
    "",
    transcriptUrl ? `Transcript: ${transcriptUrl}` : undefined,
    "",
    formatTranscript(conversation.messages),
  ]
    .filter(Boolean)
    .join("\n");

  await connection.sobject(process.env.SALESFORCE_TASK_OBJECT || "Task").create({
    WhoId: lead.salesforceId,
    Subject: "AI WhatsApp lead concierge update",
    Status: "Completed",
    Priority: "Normal",
    Description: description.slice(0, 32_000),
  });

  await connection.sobject(process.env.SALESFORCE_LEAD_OBJECT || "Lead").update({
    Id: lead.salesforceId,
    [SALESFORCE_FIELDS.aiStatus]: lead.status,
    [SALESFORCE_FIELDS.qualification]: lead.qualification
      ? JSON.stringify(lead.qualification)
      : null,
    [SALESFORCE_FIELDS.viewingBooked]: lead.status === "VIEWING_BOOKED",
    [SALESFORCE_FIELDS.optedOut]: lead.optedOut,
    [SALESFORCE_FIELDS.aiHandled]: true,
  });

  return { skipped: false as const };
}

export async function getSalesforcePropertyDetails(propertyRef: string) {
  const connection = await getSalesforceConnection();
  const escapedRef = propertyRef.replaceAll("'", "\\'");
  const objectName = optionalEnv("SALESFORCE_PROPERTY_OBJECT") || "Property__c";
  const refField = optionalEnv("SALESFORCE_PROPERTY_REF_FIELD") || "Reference__c";
  const result = await connection.query<Record<string, unknown>>(
    `SELECT Id, Name FROM ${objectName} WHERE ${refField} = '${escapedRef}' LIMIT 1`,
  );

  return result.records[0] ?? null;
}

async function getSalesforceConnection() {
  const connection = new jsforce.Connection({
    loginUrl: getEnv("SF_LOGIN_URL"),
    oauth2: {
      clientId: getEnv("SF_CLIENT_ID"),
      clientSecret: getEnv("SF_CLIENT_SECRET"),
      redirectUri: "http://localhost",
    },
  });

  await connection.login(getEnv("SF_USERNAME"), `${getEnv("SF_PASSWORD")}${getEnv("SF_TOKEN")}`);
  return connection;
}

function formatTranscript(messages: Message[]): string {
  return messages
    .map((message) => {
      const timestamp = message.createdAt.toISOString();
      return `[${timestamp}] ${message.role}: ${message.body}`;
    })
    .join("\n");
}

function getTranscriptUrl(leadId: string): string | undefined {
  const base = getAppBaseUrl();
  return base ? `${base}/dashboard/leads/${leadId}` : undefined;
}
