/**
 * WhatsApp provider interface.
 *
 * All business logic talks to this module, never to Twilio directly, so we can
 * swap to Meta Cloud API / 360dialog later by re-implementing these functions.
 */
import twilio from "twilio";
import { hasEnv, requireEnv } from "@/lib/env";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

export interface SendResult {
  providerId: string;
  status: string;
}

let twilioClient: twilio.Twilio | null = null;

function client(): twilio.Twilio {
  if (!twilioClient) {
    twilioClient = twilio(
      requireEnv("TWILIO_ACCOUNT_SID"),
      requireEnv("TWILIO_AUTH_TOKEN"),
    );
  }
  return twilioClient;
}

/** Normalise a phone number to Twilio's `whatsapp:+E164` channel address. */
export function toWhatsAppAddress(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed}`;
}

/** True when Twilio credentials are configured. */
export function whatsappConfigured(): boolean {
  return hasEnv("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM");
}

/**
 * Send a pre-approved template message. Required for first contact and for any
 * message sent OUTSIDE the 24h customer-care window.
 *
 * `vars` maps Twilio Content template variable indexes ("1", "2", ...) to values.
 */
export async function sendTemplate(
  to: string,
  templateSid: string,
  vars: Record<string, string> = {},
): Promise<SendResult> {
  const message = await client().messages.create({
    from: toWhatsAppAddress(config.whatsapp.from),
    to: toWhatsAppAddress(to),
    contentSid: templateSid,
    contentVariables: JSON.stringify(vars),
  });
  logger.info("whatsapp.template.sent", { to, templateSid, sid: message.sid });
  return { providerId: message.sid, status: message.status };
}

/**
 * Send a free-form message. ONLY valid inside the 24h customer-care window
 * (i.e. after the lead has messaged us). Callers must check the window first
 * via `isWithinWindow`.
 */
export async function sendFreeform(to: string, body: string): Promise<SendResult> {
  const message = await client().messages.create({
    from: toWhatsAppAddress(config.whatsapp.from),
    to: toWhatsAppAddress(to),
    body,
  });
  logger.info("whatsapp.freeform.sent", { to, sid: message.sid });
  return { providerId: message.sid, status: message.status };
}

/**
 * Verify an inbound Twilio webhook signature (`X-Twilio-Signature`).
 * `params` are the POST form fields. `url` is the full public URL Twilio hit.
 */
export function verifyTwilioSignature(
  signature: string | null,
  url: string,
  params: Record<string, string>,
): boolean {
  if (!signature) return false;
  try {
    return twilio.validateRequest(
      requireEnv("TWILIO_AUTH_TOKEN"),
      signature,
      url,
      params,
    );
  } catch (err) {
    logger.warn("whatsapp.signature.error", { err });
    return false;
  }
}

/**
 * Whether we are inside the WhatsApp 24h customer-care window, meaning free-form
 * replies are permitted. `lastInboundAt` is the lead's most recent inbound msg.
 */
export function isWithinWindow(
  lastInboundAt: Date | string | null | undefined,
): boolean {
  if (!lastInboundAt) return false;
  const ageMs = Date.now() - new Date(lastInboundAt).getTime();
  return ageMs <= config.whatsappWindowHours * 60 * 60 * 1000;
}
