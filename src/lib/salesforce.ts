/**
 * Salesforce integration via jsforce. Handles:
 *  - HMAC verification of inbound webhooks
 *  - Writing Tasks/Activities (transcript summary) back to SF
 *  - Updating configurable custom fields on the Lead
 *
 * All custom field API names are config-driven (see lib/config.ts).
 */
import crypto from "crypto";
import jsforce, { Connection } from "jsforce";
import { hasEnv, requireEnv } from "@/lib/env";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export function salesforceConfigured(): boolean {
  return hasEnv(
    "SF_LOGIN_URL",
    "SF_USERNAME",
    "SF_PASSWORD",
  );
}

/**
 * Verify the HMAC signature on an inbound Salesforce webhook.
 * Uses a constant-time comparison. `signature` is the raw header value; we
 * accept either a hex digest or a `sha256=<hex>` prefixed form.
 */
export function verifySalesforceSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = requireEnv("SF_WEBHOOK_SECRET");
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

let cachedConn: Connection | null = null;
let cachedAt = 0;
const CONN_TTL_MS = 30 * 60 * 1000;

/** Username/password (+ security token) login. Connection is cached briefly. */
async function connection(): Promise<Connection> {
  const now = Date.now();
  if (cachedConn && now - cachedAt < CONN_TTL_MS) return cachedConn;

  const conn = new jsforce.Connection({
    loginUrl: requireEnv("SF_LOGIN_URL"),
  });
  const password = requireEnv("SF_PASSWORD") + (process.env.SF_TOKEN ?? "");
  await conn.login(requireEnv("SF_USERNAME"), password);
  cachedConn = conn;
  cachedAt = now;
  return conn;
}

export interface SalesforceSyncInput {
  salesforceId: string;
  /** A short AI-generated summary of the conversation so far. */
  summary: string;
  /** Public URL to the full transcript in the dashboard. */
  transcriptUrl: string;
  aiStatus: string;
  qualification: Record<string, unknown> | null;
  viewingBooked: boolean;
  optedOut: boolean;
  aiHandled: boolean;
}

/**
 * Write a Task (Activity) with the transcript summary and update the Lead's
 * configurable custom fields. Failures are logged and rethrown so Inngest retries.
 */
export async function syncLeadToSalesforce(input: SalesforceSyncInput): Promise<void> {
  const conn = await connection();
  const f = config.salesforce;

  // 1) Activity / Task with the summary + transcript link.
  await conn.sobject("Task").create({
    WhoId: input.salesforceId,
    Subject: "AI Lead Concierge — conversation update",
    Status: "Completed",
    Description: `${input.summary}\n\nFull transcript: ${input.transcriptUrl}`,
    ActivityDate: new Date().toISOString().slice(0, 10),
  });

  // 2) Update configurable custom fields on the Lead.
  const fields: Record<string, unknown> = { Id: input.salesforceId };
  fields[f.statusField] = input.aiStatus;
  fields[f.qualificationField] = input.qualification
    ? JSON.stringify(input.qualification)
    : null;
  fields[f.viewingBookedField] = input.viewingBooked;
  fields[f.optedOutField] = input.optedOut;
  fields[f.aiHandledField] = input.aiHandled;

  await conn.sobject(f.leadObject).update(fields as { Id: string });
  logger.info("salesforce.synced", { salesforceId: input.salesforceId });
}

/** Fetch property facts from Salesforce if present (best-effort). */
export async function fetchPropertyFromSalesforce(
  propertyRef: string,
): Promise<Record<string, unknown> | null> {
  try {
    const conn = await connection();
    const result = await conn.query(
      `SELECT Id, Name FROM Property__c WHERE Name = '${propertyRef.replace(/'/g, "")}' LIMIT 1`,
    );
    return (result.records?.[0] as Record<string, unknown>) ?? null;
  } catch (err) {
    logger.warn("salesforce.property.fetch.failed", { err, propertyRef });
    return null;
  }
}
