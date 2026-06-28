type OptionalKey =
  | "ANTHROPIC_API_KEY"
  | "TWILIO_ACCOUNT_SID"
  | "TWILIO_AUTH_TOKEN"
  | "TWILIO_WHATSAPP_FROM"
  | "TWILIO_TEMPLATE_INTRO_SID"
  | "RESEND_API_KEY"
  | "EMAIL_FROM"
  | "SF_LOGIN_URL"
  | "SF_CLIENT_ID"
  | "SF_CLIENT_SECRET"
  | "SF_USERNAME"
  | "SF_PASSWORD"
  | "SF_TOKEN"
  | "SF_WEBHOOK_SECRET"
  | "INNGEST_EVENT_KEY"
  | "INNGEST_SIGNING_KEY"
  | "DATABASE_URL"
  | "CLERK_SECRET_KEY"
  | "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"
  | "CONSULTANT_NAME"
  | "CONSULTANT_CALENDAR_URL"
  | "CONTACT_HOURS";

export function getEnv(key: OptionalKey): string | undefined {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return undefined;
  }
  return value;
}

export function requireEnv(key: OptionalKey): string {
  const value = getEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}
