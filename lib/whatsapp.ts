import twilio from "twilio";
import type { MessageInstance } from "twilio/lib/rest/api/v2010/account/message";

import { env, requireEnv } from "@/lib/config";
import { requestUrl } from "@/lib/security";

type TemplateVariables = Record<string, string | number | boolean | null | undefined>;

export type WhatsAppSendResult = {
  providerMessageId?: string;
  skipped?: boolean;
  reason?: string;
};

function twilioClient() {
  return twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
}

function whatsappFrom(): string {
  return requireEnv("TWILIO_WHATSAPP_FROM");
}

export function whatsappIsConfigured(): boolean {
  return Boolean(env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && env("TWILIO_WHATSAPP_FROM"));
}

export async function sendTemplate(
  to: string,
  templateSid: string,
  vars: TemplateVariables
): Promise<WhatsAppSendResult> {
  if (!whatsappIsConfigured()) {
    return { skipped: true, reason: "Twilio WhatsApp credentials are not configured." };
  }

  const message: MessageInstance = await twilioClient().messages.create({
    from: whatsappFrom(),
    to: normalizeWhatsAppAddress(to),
    contentSid: templateSid,
    contentVariables: JSON.stringify(cleanTemplateVariables(vars))
  });

  return { providerMessageId: message.sid };
}

export async function sendFreeform(to: string, body: string): Promise<WhatsAppSendResult> {
  if (!whatsappIsConfigured()) {
    return { skipped: true, reason: "Twilio WhatsApp credentials are not configured." };
  }

  const message = await twilioClient().messages.create({
    from: whatsappFrom(),
    to: normalizeWhatsAppAddress(to),
    body
  });

  return { providerMessageId: message.sid };
}

export async function verifyTwilioWebhook(request: Request, form: FormData): Promise<boolean> {
  const authToken = env("TWILIO_AUTH_TOKEN");
  const signature = request.headers.get("x-twilio-signature");

  if (!authToken || !signature) {
    return false;
  }

  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = String(value);
  }

  return twilio.validateRequest(authToken, signature, requestUrl(request), params);
}

export function normalizeWhatsAppAddress(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone : `whatsapp:${phone}`;
}

export function stripWhatsAppPrefix(phone: string): string {
  return phone.replace(/^whatsapp:/, "");
}

function cleanTemplateVariables(vars: TemplateVariables): Record<string, string> {
  return Object.fromEntries(
    Object.entries(vars).map(([key, value]) => [key, value == null ? "" : String(value)])
  );
}
