import crypto from "crypto";

/**
 * Verify an HMAC-SHA256 signature over the raw request body. The Salesforce
 * Flow/Apex callout must sign the body with SF_WEBHOOK_SECRET and send the
 * hex digest in a header (e.g. `x-onehomes-signature`).
 */
export function verifyHmac(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Accept optional "sha256=" prefix.
  const provided = signature.startsWith("sha256=")
    ? signature.slice("sha256=".length)
    : signature;

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
