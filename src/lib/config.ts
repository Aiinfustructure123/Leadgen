/**
 * Central, config-driven settings. All business copy, persona, model names,
 * and Salesforce field API names live here so vendors / business rules are
 * easy to change without touching logic.
 */

/** Read an env var, returning a fallback in non-production if missing. */
function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    // Don't throw at import time — many envs are only needed for specific
    // features. Callers that require a value should validate via requireEnv.
    return "";
  }
  return value;
}

/** Throw if a required env var is missing (use inside the feature that needs it). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// ── AI models ──────────────────────────────────────────────────────────────
// Single source of truth. Swap CONVERSATION_MODEL to an Opus model for higher
// quality, or CLASSIFIER_MODEL stays cheap for intent/qualification scoring.
export const MODELS = {
  /** Live conversation: fast + smart sweet spot. */
  CONVERSATION: env("ANTHROPIC_CONVERSATION_MODEL", "claude-sonnet-4-6"),
  /** Cheap classification: intent detection, qualification scoring. */
  CLASSIFIER: env("ANTHROPIC_CLASSIFIER_MODEL", "claude-haiku-4-5-20251001"),
} as const;

export const AI = {
  maxTokens: 1024,
  maxToolIterations: 5,
} as const;

// ── Business config ──────────────────────────────────────────────────────────
export const BUSINESS = {
  consultantName: env("CONSULTANT_NAME", "Your Consultant"),
  consultantEmail: env("CONSULTANT_EMAIL", ""),
  consultantPhone: env("CONSULTANT_PHONE", ""), // E.164 for escalation pings
  calendarUrl: env("CONSULTANT_CALENDAR_URL", ""),
  contactHours: env("CONTACT_HOURS", "08:00-20:00 Europe/London"),
  companyName: env("COMPANY_NAME", "One Homes"),
  emailFrom: env("EMAIL_FROM", "One Homes <hello@onehomes.example>"),
  appUrl: env("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
} as const;

// ── Salesforce field API names (configurable per org) ───────────────────────
export const SF_FIELDS = {
  aiStatus: env("SF_FIELD_AI_STATUS", "AI_Status__c"),
  qualification: env("SF_FIELD_QUALIFICATION", "Qualification__c"),
  viewingBooked: env("SF_FIELD_VIEWING_BOOKED", "Viewing_Booked__c"),
  optedOut: env("SF_FIELD_OPTED_OUT", "Opted_Out__c"),
} as const;

// ── WhatsApp ────────────────────────────────────────────────────────────────
export const WHATSAPP = {
  /** Customer-care window in milliseconds (24h). Free-form sends only allowed inside this. */
  windowMs: 24 * 60 * 60 * 1000,
} as const;

/** Words/phrases that trigger an opt-out (case-insensitive, trimmed). */
export const OPT_OUT_KEYWORDS = [
  "stop",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "stopall",
  "remove me",
  "opt out",
  "optout",
];

export { env };
