import crypto from "node:crypto";

import { SECURITY_CONFIG } from "@/lib/config";
import { requireEnv } from "@/lib/env";

function normalizeSignature(signature: string): string {
  return signature.replace(/^sha256=/i, "").trim();
}

export function verifySalesforceSignature({
  payload,
  signature,
}: {
  payload: string;
  signature: string;
}): boolean {
  const secret = requireEnv("SF_WEBHOOK_SECRET");
  const digest = crypto
    .createHmac(SECURITY_CONFIG.webhookSignatureAlgorithm, secret)
    .update(payload)
    .digest("hex");

  const expected = normalizeSignature(digest);
  const provided = normalizeSignature(signature);
  if (expected.length !== provided.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
