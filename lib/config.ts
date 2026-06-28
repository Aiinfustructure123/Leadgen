export const MODEL_CONFIG = {
  conversationModel: process.env.ANTHROPIC_CONVERSATION_MODEL ?? "claude-sonnet-4-6",
  classificationModel:
    process.env.ANTHROPIC_CLASSIFICATION_MODEL ?? "claude-haiku-4-5-20251001",
} as const;

export const BUSINESS_CONFIG = {
  consultantName: process.env.CONSULTANT_NAME ?? "One Homes Consultant",
  consultantCalendarUrl: process.env.CONSULTANT_CALENDAR_URL ?? "",
  contactHours: process.env.CONTACT_HOURS ?? "08:00-20:00 Europe/London",
  introTemplateSid: process.env.TWILIO_TEMPLATE_INTRO_SID ?? "",
  introTemplateCopy:
    process.env.INTRO_TEMPLATE_COPY ??
    "Hi {{1}}, thanks for your enquiry with One Homes about {{2}}. I'm {{3}}, the AI assistant for {{4}}. I can help right away while they are with other clients. Reply STOP to opt out.",
} as const;

export const SALESFORCE_FIELD_CONFIG = {
  statusField: process.env.SF_FIELD_AI_STATUS ?? "AI_Status__c",
  qualificationField: process.env.SF_FIELD_QUALIFICATION ?? "Qualification__c",
  viewingBookedField: process.env.SF_FIELD_VIEWING_BOOKED ?? "Viewing_Booked__c",
  optedOutField: process.env.SF_FIELD_OPTED_OUT ?? "Opted_Out__c",
  aiHandledField: process.env.SF_FIELD_AI_HANDLED ?? "AI_Handled__c",
} as const;

export const SECURITY_CONFIG = {
  webhookSignatureHeader:
    process.env.SF_WEBHOOK_SIGNATURE_HEADER ?? "x-salesforce-signature",
  webhookSignatureAlgorithm:
    process.env.SF_WEBHOOK_SIGNATURE_ALGORITHM ?? "sha256",
  webhookRateLimitPerMinute: Number(process.env.WEBHOOK_RATE_LIMIT_PER_MINUTE ?? 60),
} as const;
