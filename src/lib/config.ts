import { z } from "zod";

const optionalString = () =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }

      const trimmed = value.trim();
      return trimmed === "" ? undefined : trimmed;
    },
    z.string().min(1).optional(),
  );

const envSchema = z.object({
  ANTHROPIC_API_KEY: optionalString(),
  ANTHROPIC_LIVE_MODEL: z.string().default("claude-sonnet-4-6"),
  ANTHROPIC_CLASSIFIER_MODEL: z
    .string()
    .default("claude-haiku-4-5-20251001"),
  TWILIO_ACCOUNT_SID: optionalString(),
  TWILIO_AUTH_TOKEN: optionalString(),
  TWILIO_WHATSAPP_FROM: optionalString(),
  TWILIO_TEMPLATE_INTRO_SID: optionalString(),
  TWILIO_TEMPLATE_FOLLOWUP_SID: optionalString(),
  RESEND_API_KEY: optionalString(),
  EMAIL_FROM: z.string().default("One Homes <hello@onehomes.example>"),
  SF_LOGIN_URL: optionalString(),
  SF_CLIENT_ID: optionalString(),
  SF_CLIENT_SECRET: optionalString(),
  SF_USERNAME: optionalString(),
  SF_PASSWORD: optionalString(),
  SF_TOKEN: optionalString(),
  SF_WEBHOOK_SECRET: optionalString(),
  SF_FIELD_AI_STATUS: z.string().default("AI_Status__c"),
  SF_FIELD_QUALIFICATION: z.string().default("Qualification__c"),
  SF_FIELD_VIEWING_BOOKED: z.string().default("Viewing_Booked__c"),
  SF_FIELD_OPTED_OUT: z.string().default("Opted_Out__c"),
  SF_FIELD_AI_HANDLED: z.string().default("AI_Handled__c"),
  INNGEST_EVENT_KEY: optionalString(),
  INNGEST_SIGNING_KEY: optionalString(),
  DATABASE_URL: optionalString(),
  CONSULTANT_NAME: z.string().default("[YOUR NAME]"),
  CONSULTANT_CALENDAR_URL: z.string().default(""),
  CONTACT_HOURS: z.string().default("08:00-20:00 Europe/London"),
  CONTACT_TIMEZONE: z.string().default("Europe/London"),
  ENABLE_MANUAL_OVERRIDE: z.coerce.boolean().default(true),
});

export const env = envSchema.parse(process.env);

export function assertEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}
