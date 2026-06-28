/**
 * Salesforce integration via jsforce.
 * All SF calls are isolated here — swap the client library without touching business logic.
 */

import * as jsforce from "jsforce";
import { createHmac, timingSafeEqual } from "crypto";
import { SF_FIELDS } from "./config";

let _conn: jsforce.Connection | null = null;

async function getConnection(): Promise<jsforce.Connection> {
  if (_conn) return _conn;

  _conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL ?? "https://login.salesforce.com",
    oauth2: {
      clientId: process.env.SF_CLIENT_ID,
      clientSecret: process.env.SF_CLIENT_SECRET,
    },
  });

  await _conn.login(
    process.env.SF_USERNAME ?? "",
    (process.env.SF_PASSWORD ?? "") + (process.env.SF_TOKEN ?? "")
  );

  return _conn;
}

export interface LeadQualification {
  budget?: string;
  beds?: string;
  location?: string;
  timeline?: string;
  buyerType?: string;
  financing?: string;
  viewingInterest?: string;
}

export interface SyncLeadOptions {
  salesforceId: string;
  aiStatus: string;
  qualification?: LeadQualification;
  viewingBooked?: boolean;
  optedOut?: boolean;
  transcriptSummary?: string;
  transcriptUrl?: string;
}

/**
 * Write an Activity/Task to Salesforce with a conversation summary,
 * and update custom qualification fields on the Lead.
 */
export async function syncLeadToSalesforce(opts: SyncLeadOptions): Promise<void> {
  const conn = await getConnection();

  // Update custom fields on the Lead record
  const updateFields: Record<string, unknown> = {
    [SF_FIELDS.aiStatus]: opts.aiStatus,
  };

  if (opts.qualification !== undefined) {
    updateFields[SF_FIELDS.qualification] = JSON.stringify(opts.qualification);
  }
  if (opts.viewingBooked !== undefined) {
    updateFields[SF_FIELDS.viewingBooked] = opts.viewingBooked;
  }
  if (opts.optedOut !== undefined) {
    updateFields[SF_FIELDS.optedOut] = opts.optedOut;
  }

  await conn.sobject("Lead").update({
    Id: opts.salesforceId,
    ...updateFields,
  });

  // Create a Task (Activity) with the transcript summary
  if (opts.transcriptSummary) {
    await conn.sobject("Task").create({
      WhoId: opts.salesforceId,
      Subject: "AI Concierge — Conversation Summary",
      Description: opts.transcriptSummary,
      Status: "Completed",
      Priority: "Normal",
      Type: "Call",
    });
  }
}

export interface SalesforceLeadPayload {
  salesforceId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  enquiryType?: string;
  propertyRef?: string;
  source?: string;
}

/**
 * Verify the HMAC signature on an inbound Salesforce webhook.
 */
export function verifySalesforceSignature(
  body: string,
  signature: string
): boolean {
  const secret = process.env.SF_WEBHOOK_SECRET ?? "";
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const provided = signature.replace("sha256=", "");

  if (expected.length !== provided.length) return false;

  return timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(provided, "hex")
  );
}
