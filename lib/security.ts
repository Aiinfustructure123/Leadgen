import crypto from "node:crypto";

export function verifyHmacSignature(rawBody: string, signatureHeader: string | null, secret?: string): boolean {
  if (!secret || !signatureHeader) {
    return false;
  }

  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");

  try {
    const providedBuffer = Buffer.from(provided, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return (
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    );
  } catch {
    return false;
  }
}

export function requestUrl(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (proto) {
    url.protocol = `${proto}:`;
  }

  if (host) {
    url.host = host;
  }

  return url.toString();
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}
