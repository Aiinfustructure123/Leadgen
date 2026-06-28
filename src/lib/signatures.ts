import crypto from "node:crypto";

export function verifyHmacSignature(args: {
  payload: string;
  signature: string | null;
  secret: string | null | undefined;
}) {
  if (!args.signature || !args.secret) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", args.secret)
    .update(args.payload)
    .digest("hex");

  const left = Buffer.from(expected);
  const right = Buffer.from(args.signature);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function payloadHash(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}
