export const CLAUDE_CONVERSATION_MODEL = "claude-sonnet-4-6";
export const CLAUDE_CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

export const WHATSAPP_CARE_WINDOW_HOURS = 24;

export const introTemplateCopy =
  "Hi {{first_name}}, thanks for your enquiry about {{enquiry_type}} with One Homes. " +
  "I am {{consultant_name}}'s AI assistant and can help right away while they are with clients. " +
  "Reply here with any questions, or reply STOP to opt out.";

export function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const appConfig = {
  appUrl: env("APP_URL") ?? "http://localhost:3000",
  consultantName: env("CONSULTANT_NAME") ?? "[YOUR NAME]",
  consultantEmail: env("CONSULTANT_EMAIL"),
  consultantCalendarUrl: env("CONSULTANT_CALENDAR_URL"),
  contactHours: env("CONTACT_HOURS") ?? "08:00-20:00 Europe/London",
  emailFrom: env("EMAIL_FROM") ?? "One Homes <hello@onehomes.example>"
};

export const salesforceConfig = {
  leadObject: env("SF_LEAD_OBJECT") ?? "Lead",
  taskObject: env("SF_TASK_OBJECT") ?? "Task",
  fields: {
    aiStatus: env("SF_FIELD_AI_STATUS") ?? "AI_Status__c",
    qualification: env("SF_FIELD_QUALIFICATION") ?? "Qualification__c",
    viewingBooked: env("SF_FIELD_VIEWING_BOOKED") ?? "Viewing_Booked__c",
    optedOut: env("SF_FIELD_OPTED_OUT") ?? "Opted_Out__c",
    aiHandled: env("SF_FIELD_AI_HANDLED") ?? "AI_Handled__c",
    transcriptUrl: env("SF_FIELD_TRANSCRIPT_URL") ?? "Transcript_URL__c"
  },
  propertyObject: env("SF_PROPERTY_OBJECT"),
  propertyRefField: env("SF_PROPERTY_REF_FIELD")
};

export function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}
