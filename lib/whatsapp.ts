import twilio from "twilio";

import { getEnv } from "@/lib/config";
import { isInsideWhatsAppCareWindow } from "@/lib/contact-hours";

type TemplateVars = Record<string, string | number | boolean | null | undefined>;

export async function sendTemplate(to: string, templateSid: string, vars: TemplateVars = {}) {
  const client = getTwilioClient();
  const message = await client.messages.create({
    from: getEnv("TWILIO_WHATSAPP_FROM"),
    to: toWhatsAppAddress(to),
    contentSid: templateSid,
    contentVariables: JSON.stringify(vars),
  });

  return { providerMessageId: message.sid };
}

export async function sendFreeform(
  to: string,
  body: string,
  options: { lastInboundAt?: Date | null } = {},
) {
  if (!isInsideWhatsAppCareWindow(options.lastInboundAt)) {
    throw new Error("Cannot send free-form WhatsApp message outside the 24-hour care window.");
  }

  const client = getTwilioClient();
  const message = await client.messages.create({
    from: getEnv("TWILIO_WHATSAPP_FROM"),
    to: toWhatsAppAddress(to),
    body,
  });

  return { providerMessageId: message.sid };
}

export function toE164FromWhatsAppAddress(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.replace(/^whatsapp:/, "");
}

function toWhatsAppAddress(value: string): string {
  return value.startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

function getTwilioClient() {
  return twilio(getEnv("TWILIO_ACCOUNT_SID"), getEnv("TWILIO_AUTH_TOKEN"));
}
