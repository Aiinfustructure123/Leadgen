import { prisma } from "./db";

/**
 * Record a webhook event for idempotency. Returns true if this is the FIRST
 * time we've seen (source, externalId); false if it's a duplicate.
 */
export async function recordWebhookEvent(
  source: string,
  externalId: string
): Promise<boolean> {
  if (!externalId) return true; // can't dedupe without an id; allow through
  try {
    await prisma.webhookEvent.create({ data: { source, externalId } });
    return true;
  } catch {
    // Unique constraint violation => duplicate.
    return false;
  }
}
