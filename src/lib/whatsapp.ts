import twilio from "twilio";
import { requireEnv } from "./config";
import { logger } from "./logger";

/**
 * WhatsApp provider interface. All business logic talks to this, never to
 * Twilio directly, so we can swap to Meta Cloud API / 360dialog later.
 */
export interface WhatsAppSendResult {
  id: string; // provider message id
  provider: "twilio";
}

export interface WhatsAppProvider {
  sendTemplate(
    to: string,
    templateSid: string,
    vars: Record<string, string>
  ): Promise<WhatsAppSendResult>;
  sendFreeform(to: string, body: string): Promise<WhatsAppSendResult>;
  /** Validate an inbound webhook signature. */
  validateSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean;
}

/** Normalise a phone number into Twilio's `whatsapp:+E164` form. */
export function toWhatsAppAddress(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("whatsapp:")) return trimmed;
  return `whatsapp:${trimmed}`;
}

/** Strip the `whatsapp:` prefix to get a bare E.164 number. */
export function fromWhatsAppAddress(addr: string): string {
  return addr.replace(/^whatsapp:/, "").trim();
}

let cachedClient: ReturnType<typeof twilio> | null = null;

function client() {
  if (!cachedClient) {
    cachedClient = twilio(
      requireEnv("TWILIO_ACCOUNT_SID"),
      requireEnv("TWILIO_AUTH_TOKEN")
    );
  }
  return cachedClient;
}

class TwilioWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(
    to: string,
    templateSid: string,
    vars: Record<string, string>
  ): Promise<WhatsAppSendResult> {
    const from = requireEnv("TWILIO_WHATSAPP_FROM");
    const msg = await client().messages.create({
      from,
      to: toWhatsAppAddress(to),
      // Twilio Content API: contentSid + JSON-encoded variables map.
      contentSid: templateSid,
      contentVariables: JSON.stringify(vars),
    });
    logger.info("whatsapp.template.sent", { to, templateSid, sid: msg.sid });
    return { id: msg.sid, provider: "twilio" };
  }

  async sendFreeform(to: string, body: string): Promise<WhatsAppSendResult> {
    const from = requireEnv("TWILIO_WHATSAPP_FROM");
    const msg = await client().messages.create({
      from,
      to: toWhatsAppAddress(to),
      body,
    });
    logger.info("whatsapp.freeform.sent", { to, sid: msg.sid });
    return { id: msg.sid, provider: "twilio" };
  }

  validateSignature(
    signature: string,
    url: string,
    params: Record<string, string>
  ): boolean {
    try {
      return twilio.validateRequest(
        requireEnv("TWILIO_AUTH_TOKEN"),
        signature,
        url,
        params
      );
    } catch (err) {
      logger.error("whatsapp.signature.error", { err: String(err) });
      return false;
    }
  }
}

export const whatsapp: WhatsAppProvider = new TwilioWhatsAppProvider();
