import jsforce from "jsforce";

import { SALESFORCE_FIELD_CONFIG } from "@/lib/config";
import { requireEnv } from "@/lib/env";

type SyncPayload = {
  salesforceId: string;
  status: string;
  qualification: Record<string, unknown> | null;
  viewingBooked: boolean;
  optedOut: boolean;
  transcriptSummary: string;
};

async function connect() {
  const conn = new jsforce.Connection({
    loginUrl: requireEnv("SF_LOGIN_URL"),
    oauth2: {
      clientId: requireEnv("SF_CLIENT_ID"),
      clientSecret: requireEnv("SF_CLIENT_SECRET"),
      loginUrl: requireEnv("SF_LOGIN_URL"),
    },
  });

  await conn.login(requireEnv("SF_USERNAME"), `${requireEnv("SF_PASSWORD")}${requireEnv("SF_TOKEN")}`);
  return conn;
}

export async function syncConversationToSalesforce(payload: SyncPayload) {
  const conn = await connect();

  const updateBody: Record<string, unknown> = {
    Id: payload.salesforceId,
    [SALESFORCE_FIELD_CONFIG.statusField]: payload.status,
    [SALESFORCE_FIELD_CONFIG.qualificationField]: JSON.stringify(payload.qualification ?? {}),
    [SALESFORCE_FIELD_CONFIG.viewingBookedField]: payload.viewingBooked,
    [SALESFORCE_FIELD_CONFIG.optedOutField]: payload.optedOut,
    [SALESFORCE_FIELD_CONFIG.aiHandledField]: true,
  };

  await conn.sobject("Lead").update(updateBody);

  await conn.sobject("Task").create({
    WhoId: payload.salesforceId,
    Subject: "One Homes AI Concierge Transcript",
    Status: "Completed",
    Priority: "Normal",
    Description: payload.transcriptSummary,
  });
}
