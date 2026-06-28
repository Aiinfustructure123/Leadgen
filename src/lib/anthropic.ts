import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "@/lib/env";

/**
 * Model configuration. Kept as single constants so swapping to Opus (for higher
 * quality) or a newer Sonnet/Haiku is a one-line change.
 */
export const MODELS = {
  /** Live, contextual qualifying conversation — fast + smart sweet spot. */
  conversation: "claude-sonnet-4-6",
  /** Cheap classification: intent detection, qualification scoring, summaries. */
  classification: "claude-haiku-4-5-20251001",
} as const;

export const GENERATION = {
  maxTokens: 1024,
  // WhatsApp messages should stay short; the system prompt enforces tone too.
  temperature: 0.6,
} as const;

let client: Anthropic | null = null;

/** Lazily-instantiated Anthropic client (so build works without the key). */
export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return client;
}
