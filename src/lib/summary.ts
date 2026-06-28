import { anthropic } from "./anthropic";
import { MODELS } from "./config";
import { logger } from "./logger";
import type { Message } from "@prisma/client";

/** Generate a concise transcript summary using the cheap classifier model. */
export async function summariseConversation(messages: Message[]): Promise<string> {
  const transcript = messages
    .filter((m) => m.body.trim())
    .map((m) => `${m.role}: ${m.body}`)
    .join("\n");

  if (!transcript) return "No conversation yet.";

  try {
    const res = await anthropic().messages.create({
      model: MODELS.CLASSIFIER,
      max_tokens: 300,
      system:
        "You summarise a property lead conversation for a CRM activity log. Be factual and concise (3-5 sentences). Include: what they want, qualification facts learned, current status, and any next step or escalation. No preamble.",
      messages: [{ role: "user", content: `Transcript:\n${transcript}` }],
    });
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n")
      .trim();
    return text || "Conversation in progress.";
  } catch (err) {
    logger.error("summary.error", { err: String(err) });
    // Fallback: naive summary.
    const last = messages[messages.length - 1];
    return `Conversation in progress (${messages.length} messages). Last: ${last?.role}: ${last?.body?.slice(0, 140)}`;
  }
}
