import jsforce from "jsforce";

import { env } from "@/lib/config";

export type SalesforceInboundLeadPayload = {
  eventId?: string;
  salesforceId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  enquiryType?: string;
  propertyRef?: string;
  source?: string;
  consentSource?: string;
  salesforceUrl?: string;
};

type SalesforceSyncInput = {
  salesforceId: string;
  status: string;
  qualificationJson: string;
  viewedBooked: boolean;
  optedOut: boolean;
  transcriptSummary: string;
  transcriptLink?: string;
};

function isConfigured() {
  return Boolean(
    env.SF_LOGIN_URL &&
      env.SF_CLIENT_ID &&
      env.SF_CLIENT_SECRET &&
      env.SF_USERNAME &&
      env.SF_PASSWORD &&
      env.SF_TOKEN,
  );
}

async function connect() {
  if (!isConfigured()) {
    return null;
  }

  const conn = new jsforce.Connection({
    oauth2: {
      loginUrl: env.SF_LOGIN_URL,
      clientId: env.SF_CLIENT_ID,
      clientSecret: env.SF_CLIENT_SECRET,
    },
  });

  await conn.login(env.SF_USERNAME!, `${env.SF_PASSWORD!}${env.SF_TOKEN!}`);
  return conn;
}

export async function writeConversationUpdateToSalesforce(input: SalesforceSyncInput) {
  const conn = await connect();
  if (!conn) {
    return { skipped: true, reason: "Salesforce credentials not configured" };
  }

  await conn.sobject("Lead").update({
    Id: input.salesforceId,
    [env.SF_FIELD_AI_STATUS]: input.status,
    [env.SF_FIELD_QUALIFICATION]: input.qualificationJson,
    [env.SF_FIELD_VIEWING_BOOKED]: input.viewedBooked,
    [env.SF_FIELD_OPTED_OUT]: input.optedOut,
    [env.SF_FIELD_AI_HANDLED]: true,
  });

  await conn.sobject("Task").create({
    Subject: "AI conversation update",
    Description: `${input.transcriptSummary}${input.transcriptLink ? `\n\nTranscript: ${input.transcriptLink}` : ""}`,
    Status: "Completed",
    Priority: "Normal",
    WhoId: input.salesforceId,
  });

  return { skipped: false };
}
