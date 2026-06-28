/**
 * WhatsApp provider abstraction — all Twilio calls are isolated here.
 * To swap to Meta Cloud API or 360dialog, change only this file.
 */

import twilio from "twilio";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    _client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return _client;
}

const FROM = () => process.env.TWILIO_WHATSAPP_FROM ?? "";

export interface SendTemplateOptions {
  to: string; // E.164 phone number
  templateSid: string;
  vars?: Record<string, string>;
}

/**
 * Send a pre-approved WhatsApp template.
 * Use this for first contact and any message outside the 24-hour window.
 */
export async function sendTemplate({
  to,
  templateSid,
  vars = {},
}: SendTemplateOptions): Promise<string> {
  const toWa = normaliseWhatsAppNumber(to);

  const msg = await getClient().messages.create({
    from: FROM(),
    to: toWa,
    contentSid: templateSid,
    contentVariables: JSON.stringify(vars),
  });

  return msg.sid;
}

/**
 * Send a free-form WhatsApp message.
 * Only call this when the lead has messaged within the last 24 hours
 * (i.e. we are inside the customer-care window).
 */
export async function sendFreeform(to: string, body: string): Promise<string> {
  const toWa = normaliseWhatsAppNumber(to);

  const msg = await getClient().messages.create({
    from: FROM(),
    to: toWa,
    body,
  });

  return msg.sid;
}

/**
 * Verify that an inbound HTTP request genuinely came from Twilio.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN ?? "",
    signature,
    url,
    params
  );
}

function normaliseWhatsAppNumber(phone: string): string {
  if (phone.startsWith("whatsapp:")) return phone;
  return `whatsapp:${phone}`;
}
