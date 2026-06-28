import Anthropic from "@anthropic-ai/sdk";
import { requireEnv } from "./config";

let cached: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!cached) {
    cached = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  }
  return cached;
}
