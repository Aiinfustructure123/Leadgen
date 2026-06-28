import twilio from "twilio";

import { requireEnv } from "@/lib/env";

function getClient() {
  return twilio(requireEnv("TWILIO_ACCOUNT_SID"), requireEnv("TWILIO_AUTH_TOKEN"));
}

export async function sendTemplate(
  to: string,
  templateSid: string,
  vars: Record<string, string>,
) {
  const response = await getClient().messages.create({
    from: requireEnv("TWILIO_WHATSAPP_FROM"),
    to: normalizeWhatsappTarget(to),
    contentSid: templateSid,
    contentVariables: JSON.stringify(vars),
  });
  return response;
}

export async function sendFreeform(to: string, body: string) {
  const response = await getClient().messages.create({
    from: requireEnv("TWILIO_WHATSAPP_FROM"),
    to: normalizeWhatsappTarget(to),
    body,
  });
  return response;
}

function normalizeWhatsappTarget(target: string): string {
  return target.startsWith("whatsapp:") ? target : `whatsapp:${target}`;
}
