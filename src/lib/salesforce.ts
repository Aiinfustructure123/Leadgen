import jsforce, { Connection } from "jsforce";
import { SF_FIELDS, requireEnv } from "./config";
import { logger } from "./logger";

/**
 * Salesforce write-back interface. We only construct a connection lazily and
 * cache it; callers use the exported helpers.
 */

let cachedConn: Connection | null = null;
let connExpiry = 0;

async function connection(): Promise<Connection> {
  const now = Date.now();
  if (cachedConn && now < connExpiry) return cachedConn;

  const conn = new jsforce.Connection({
    loginUrl: requireEnv("SF_LOGIN_URL"),
    oauth2: {
      clientId: requireEnv("SF_CLIENT_ID"),
      clientSecret: requireEnv("SF_CLIENT_SECRET"),
      loginUrl: requireEnv("SF_LOGIN_URL"),
    },
  });

  // Username/password + security token flow.
  await conn.login(
    requireEnv("SF_USERNAME"),
    `${requireEnv("SF_PASSWORD")}${process.env.SF_TOKEN ?? ""}`
  );

  cachedConn = conn;
  connExpiry = now + 30 * 60 * 1000; // refresh every 30 min
  return conn;
}

export interface SalesforceSyncInput {
  salesforceId: string; // Lead/Contact Id in Salesforce
  aiStatus: string;
  qualification: Record<string, unknown> | null;
  viewingBooked: boolean;
  optedOut: boolean;
  summary: string; // AI-generated transcript summary
  transcriptUrl: string;
}

/**
 * Write a Task (Activity) with the AI summary + transcript link, and update
 * the lead's custom fields. Field API names are configurable via env.
 */
export async function syncLeadToSalesforce(input: SalesforceSyncInput): Promise<void> {
  const conn = await connection();

  // 1) Update custom fields on the Lead.
  const fields: Record<string, unknown> = {
    Id: input.salesforceId,
    [SF_FIELDS.aiStatus]: input.aiStatus,
    [SF_FIELDS.qualification]: input.qualification
      ? JSON.stringify(input.qualification)
      : null,
    [SF_FIELDS.viewingBooked]: input.viewingBooked,
    [SF_FIELDS.optedOut]: input.optedOut,
  };

  try {
    // Field API names are configurable/dynamic, so bypass jsforce's strict
    // per-field schema typing here.
    await conn.sobject("Lead").update(fields as { Id: string });
  } catch (err) {
    logger.error("salesforce.update.error", {
      salesforceId: input.salesforceId,
      err: String(err),
    });
    throw err;
  }

  // 2) Log a Task/Activity with the summary + transcript link.
  try {
    await conn.sobject("Task").create({
      WhoId: input.salesforceId,
      Subject: "AI Lead Concierge — conversation update",
      Description: `${input.summary}\n\nFull transcript: ${input.transcriptUrl}`,
      Status: "Completed",
      Priority: "Normal",
      ActivityDate: new Date().toISOString().slice(0, 10),
    });
  } catch (err) {
    // Task creation failing shouldn't block — log and continue.
    logger.warn("salesforce.task.error", {
      salesforceId: input.salesforceId,
      err: String(err),
    });
  }

  logger.info("salesforce.synced", { salesforceId: input.salesforceId });
}

/**
 * Fetch authoritative property facts from Salesforce (optional). Returns null
 * if not found or not configured. The DB Property table is the primary source;
 * this is a fallback hook.
 */
export async function fetchPropertyFromSalesforce(
  _propertyRef: string
): Promise<Record<string, unknown> | null> {
  // Intentionally not implemented against a specific SF object — the property
  // object/field API names must be supplied by the business before go-live.
  return null;
}
