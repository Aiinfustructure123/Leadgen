import crypto from "node:crypto";

import twilio from "twilio";

import { getAppBaseUrl, getEnv } from "@/lib/config";

export function verifyHmacSignature({
  body,
  header,
  secret,
}: {
  body: string;
  header: string | null;
  secret: string;
}): boolean {
  if (!header) {
    return false;
  }

  const received = header.replace(/^sha256=/, "");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");

  return timingSafeEqualHex(received, expected);
}

export function verifySalesforceSignature(body: string, header: string | null): boolean {
  return verifyHmacSignature({
    body,
    header,
    secret: getEnv("SF_WEBHOOK_SECRET"),
  });
}

export function verifyTwilioSignature(request: Request, params: Record<string, string>): boolean {
  const signature = request.headers.get("x-twilio-signature");

  if (!signature) {
    return false;
  }

  const url = getPublicRequestUrl(request);
  return twilio.validateRequest(getEnv("TWILIO_AUTH_TOKEN"), signature, url, params);
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function getPublicRequestUrl(request: Request): string {
  const configured = getAppBaseUrl();

  if (!configured) {
    return request.url;
  }

  const incoming = new URL(request.url);
  return `${configured}${incoming.pathname}${incoming.search}`;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const left = Buffer.from(a, "hex");
    const right = Buffer.from(b, "hex");

    if (left.length !== right.length) {
      return false;
    }

    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}
