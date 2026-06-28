export const AI_MODELS = {
  conversation: "claude-sonnet-4-6",
  classifier: "claude-haiku-4-5-20251001",
} as const;

export const SALESFORCE_FIELDS = {
  aiStatus: process.env.SALESFORCE_FIELD_AI_STATUS ?? "AI_Status__c",
  qualification: process.env.SALESFORCE_FIELD_QUALIFICATION ?? "Qualification__c",
  viewingBooked: process.env.SALESFORCE_FIELD_VIEWING_BOOKED ?? "Viewing_Booked__c",
  optedOut: process.env.SALESFORCE_FIELD_OPTED_OUT ?? "Opted_Out__c",
  aiHandled: process.env.SALESFORCE_FIELD_AI_HANDLED ?? "AI_Handled__c",
} as const;

export function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function getConsultantName(): string {
  return process.env.CONSULTANT_NAME || "[YOUR NAME]";
}

export function getCalendarUrl(): string | undefined {
  return optionalEnv("CONSULTANT_CALENDAR_URL");
}

export function getContactHours(): string {
  return process.env.CONTACT_HOURS || "08:00-20:00 Europe/London";
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM || "One Homes <hello@onehomes.example>";
}

export function getAppBaseUrl(): string | undefined {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return undefined;
}
