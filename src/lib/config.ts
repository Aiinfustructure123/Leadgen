/**
 * Business configuration — all persona, copy, and policy values live here so
 * they can be tuned without touching business logic. Most are env-driven.
 */
import { optionalEnv } from "@/lib/env";

export const config = {
  consultant: {
    name: optionalEnv("CONSULTANT_NAME", "Your Consultant"),
    calendarUrl: optionalEnv("CONSULTANT_CALENDAR_URL", ""),
    company: "One Homes",
  },

  /** Contact hours, e.g. "08:00-20:00 Europe/London". */
  contactHours: optionalEnv("CONTACT_HOURS", "08:00-20:00 Europe/London"),

  email: {
    from: optionalEnv("EMAIL_FROM", "One Homes <hello@onehomes.example>"),
  },

  whatsapp: {
    from: optionalEnv("TWILIO_WHATSAPP_FROM", ""),
    introTemplateSid: optionalEnv("TWILIO_TEMPLATE_INTRO_SID", ""),
  },

  /**
   * WhatsApp customer-care window: free-form (AI) replies are only allowed
   * within this many hours of the lead's last inbound message. Outside it,
   * only pre-approved templates may be sent.
   */
  whatsappWindowHours: 24,

  /**
   * Salesforce custom field API names. Made configurable because every org
   * names its custom fields differently. Override via env if needed.
   */
  salesforce: {
    statusField: optionalEnv("SF_FIELD_AI_STATUS", "AI_Status__c"),
    qualificationField: optionalEnv("SF_FIELD_QUALIFICATION", "Qualification__c"),
    viewingBookedField: optionalEnv("SF_FIELD_VIEWING_BOOKED", "Viewing_Booked__c"),
    optedOutField: optionalEnv("SF_FIELD_OPTED_OUT", "Opted_Out__c"),
    aiHandledField: optionalEnv("SF_FIELD_AI_HANDLED", "AI_Handled__c"),
    /** Object the inbound webhook upserts against (Lead by default). */
    leadObject: optionalEnv("SF_LEAD_OBJECT", "Lead"),
  },

  /** Public base URL used to build transcript links in Salesforce activities. */
  appUrl: optionalEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
} as const;

/** The opt-out keywords that immediately halt all messaging. */
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
