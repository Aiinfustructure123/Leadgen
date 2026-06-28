import jsforce from "jsforce";
import type { Connection } from "jsforce";
import type { Lead, Message } from "@prisma/client";

import { appConfig, env, salesforceConfig } from "@/lib/config";
import { formatQualification, leadDisplayName, transcriptText } from "@/lib/lead-utils";

type SalesforceResult = {
  skipped?: boolean;
  reason?: string;
  id?: string;
};

export function salesforceIsConfigured(): boolean {
  return Boolean(
    env("SF_LOGIN_URL") &&
      env("SF_CLIENT_ID") &&
      env("SF_CLIENT_SECRET") &&
      env("SF_USERNAME") &&
      env("SF_PASSWORD") &&
      env("SF_TOKEN")
  );
}

async function connection(): Promise<Connection> {
  const conn = new jsforce.Connection({
    loginUrl: env("SF_LOGIN_URL"),
    oauth2: {
      clientId: env("SF_CLIENT_ID"),
      clientSecret: env("SF_CLIENT_SECRET"),
      redirectUri: `${appConfig.appUrl}/api/salesforce/callback`
    }
  });

  await conn.login(env("SF_USERNAME")!, `${env("SF_PASSWORD")!}${env("SF_TOKEN")!}`);
  return conn;
}

export async function syncLeadToSalesforce(
  lead: Lead,
  messages: Pick<Message, "role" | "body" | "createdAt">[]
): Promise<SalesforceResult> {
  if (!lead.salesforceId) {
    return { skipped: true, reason: "Lead has no Salesforce id." };
  }

  if (!salesforceIsConfigured()) {
    return { skipped: true, reason: "Salesforce credentials are not configured." };
  }

  const conn = await connection();
  const fields = salesforceConfig.fields;
  const qualification = formatQualification(lead.qualification);
  const transcript = transcriptText(messages);
  const transcriptUrl = `${appConfig.appUrl}/dashboard/leads/${lead.id}`;

  await conn.sobject(salesforceConfig.leadObject).update({
    Id: lead.salesforceId,
    [fields.aiStatus]: lead.status,
    [fields.qualification]: qualification,
    [fields.viewingBooked]: lead.status === "VIEWING_BOOKED",
    [fields.optedOut]: lead.optedOut,
    [fields.aiHandled]: true,
    [fields.transcriptUrl]: transcriptUrl
  });

  const task = await conn.sobject(salesforceConfig.taskObject).create({
    WhoId: lead.salesforceId,
    Subject: `AI lead concierge update - ${leadDisplayName(lead)}`,
    Status: "Completed",
    Priority: "Normal",
    Description: [
      `Status: ${lead.status}`,
      "",
      "Qualification:",
      qualification,
      "",
      `Transcript: ${transcriptUrl}`,
      "",
      "Recent transcript:",
      transcript.slice(-16_000)
    ].join("\n")
  });

  return { id: task.id };
}

export async function getPropertyDetails(propertyRef: string): Promise<Record<string, unknown>> {
  if (!propertyRef) {
    return { found: false, message: "No property reference was supplied." };
  }

  if (!salesforceIsConfigured() || !salesforceConfig.propertyObject || !salesforceConfig.propertyRefField) {
    return {
      found: false,
      propertyRef,
      message:
        "No verified property record is configured for this environment. Do not invent facts; ask the consultant to confirm."
    };
  }

  const conn = await connection();
  const refField = salesforceConfig.propertyRefField;
  const object = salesforceConfig.propertyObject;
  const safeRef = propertyRef.replaceAll("'", "\\'");
  const result = await conn.query<Record<string, unknown>>(
    `SELECT Id, Name, ${refField} FROM ${object} WHERE ${refField} = '${safeRef}' LIMIT 1`
  );

  if (result.records.length === 0) {
    return {
      found: false,
      propertyRef,
      message: "No verified property details were found for this reference."
    };
  }

  return {
    found: true,
    propertyRef,
    details: result.records[0]
  };
}
