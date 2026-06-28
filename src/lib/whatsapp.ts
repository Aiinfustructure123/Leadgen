import twilio from "twilio";

import { assertEnv, env } from "@/lib/config";

type TemplateVars = Record<string, string>;

let clientInstance: ReturnType<typeof twilio> | null = null;

function client() {
  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = twilio(assertEnv("TWILIO_ACCOUNT_SID"), assertEnv("TWILIO_AUTH_TOKEN"));
  return clientInstance;
}

export const INTRO_TEMPLATE_COPY = `Hi {{1}}, thanks for your enquiry with One Homes about {{2}}.
I'm {{3}}'s AI assistant and can help right away with details and next steps.
Reply STOP to opt out.`;

export async function sendTemplate(
  to: string,
  templateSid: string,
  vars: TemplateVars,
) {
  const message = await client().messages.create({
    from: assertEnv("TWILIO_WHATSAPP_FROM"),
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    contentSid: templateSid,
    contentVariables: JSON.stringify(vars),
  });

  return {
    id: message.sid,
    status: message.status,
  };
}

export async function sendFreeform(to: string, body: string) {
  const message = await client().messages.create({
    from: assertEnv("TWILIO_WHATSAPP_FROM"),
    to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
    body,
  });

  return {
    id: message.sid,
    status: message.status,
  };
}

export function verifyTwilioSignature(args: {
  signature: string | null;
  url: string;
  params: Record<string, string>;
}) {
  if (!args.signature) {
    return false;
  }

  if (!env.TWILIO_AUTH_TOKEN) {
    return false;
  }

  return twilio.validateRequest(env.TWILIO_AUTH_TOKEN, args.signature, args.url, args.params);
}
