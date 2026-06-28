import { anthropic, MODELS } from "@/lib/anthropic";
import type { Role } from "@/generated/prisma";

/**
 * Produce a concise summary of the conversation for the Salesforce activity,
 * using the cheap classification model.
 */
export async function summariseConversation(
  history: { role: Role; body: string }[],
): Promise<string> {
  if (history.length === 0) return "No conversation yet.";

  const transcript = history
    .map((m) => `${roleLabel(m.role)}: ${m.body}`)
    .join("\n");

  const response = await anthropic().messages.create({
    model: MODELS.classification,
    max_tokens: 400,
    system:
      "You summarise a property lead conversation for a CRM activity log. " +
      "Write 2-4 short sentences covering: what the lead wants, key qualification facts learned " +
      "(budget, location, beds, timeline, buyer/investor, financing, viewing interest), and the current " +
      "outcome / next step. Be factual and concise. No preamble.",
    messages: [{ role: "user", content: `Conversation transcript:\n\n${transcript}` }],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { text: string }).text)
    .join(" ")
    .trim();
  return text || "Conversation in progress.";
}

function roleLabel(role: Role): string {
  switch (role) {
    case "LEAD":
      return "Lead";
    case "AI":
      return "AI";
    case "HUMAN":
      return "Consultant";
    default:
      return "System";
  }
}
