/**
 * Centralised business configuration.
 * All copy, credentials, and tunable constants live here.
 */

export const AI_MODELS = {
  conversation: "claude-sonnet-4-6",
  classification: "claude-haiku-4-5-20251001",
} as const;

export const CONSULTANT_NAME =
  process.env.CONSULTANT_NAME ?? "Your Consultant";

export const CONSULTANT_CALENDAR_URL =
  process.env.CONSULTANT_CALENDAR_URL ?? "";

export const CONTACT_HOURS =
  process.env.CONTACT_HOURS ?? "08:00-20:00 Europe/London";

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "One Homes <hello@onehomes.example>";

/** Salesforce custom field API names — change here if org uses different names */
export const SF_FIELDS = {
  aiStatus: "AI_Status__c",
  qualification: "Qualification__c",
  viewingBooked: "Viewing_Booked__c",
  optedOut: "Opted_Out__c",
} as const;

/** How long (ms) the 24-hour WhatsApp customer-care window lasts */
export const WA_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Rate-limit: max messages AI will send per conversation per hour */
export const AI_RATE_LIMIT_PER_HOUR = 20;
