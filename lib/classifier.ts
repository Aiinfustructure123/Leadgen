import Anthropic from "@anthropic-ai/sdk";

import { MODEL_CONFIG } from "@/lib/config";
import { requireEnv } from "@/lib/env";

type IntentClassification = {
  intent: string;
  qualificationHints: Record<string, string>;
  shouldEscalate: boolean;
};

function getClient() {
  return new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

export async function classifyInboundMessage(message: string): Promise<IntentClassification | null> {
  const prompt = `Classify this WhatsApp lead message for a property consultant. Return strict JSON with keys:
intent (string), qualificationHints (object of string->string), shouldEscalate (boolean).
Message: """${message}"""`;

  try {
    const response = await getClient().messages.create({
      model: MODEL_CONFIG.classificationModel,
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("");
    const parsed = JSON.parse(text) as IntentClassification;
    return parsed;
  } catch {
    return null;
  }
}
