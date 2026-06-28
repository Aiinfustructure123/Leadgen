import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS, GENERATION } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/agent/tools";
import type { Role } from "@/generated/prisma";

const MAX_TOOL_ITERATIONS = 6;

export interface AgentResult {
  /** Final text reply to send to the lead (may be empty if fully tool-driven). */
  reply: string;
  effects: ToolContext["effects"];
  /** Tool calls made, for logging into Message.meta. */
  toolCalls: { name: string; input: unknown }[];
}

/**
 * Run one turn of the conversation agent for a lead's latest inbound message.
 * Loads history, calls Claude with tools, executes tool calls until the model
 * produces a final text reply.
 */
export async function runAgent(opts: {
  leadId: string;
  conversationId: string;
}): Promise<AgentResult> {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: opts.leadId } });
  const history = await prisma.message.findMany({
    where: { conversationId: opts.conversationId },
    orderBy: { createdAt: "asc" },
  });

  const system = buildSystemPrompt({
    firstName: lead.firstName,
    enquiryType: lead.enquiryType,
    propertyRef: lead.propertyRef,
    source: lead.source,
    qualification: lead.qualification as Record<string, unknown> | null,
  });

  const messages = toAnthropicMessages(history);

  const ctx: ToolContext = {
    leadId: opts.leadId,
    conversationId: opts.conversationId,
    effects: {
      optedOut: false,
      handedOff: false,
      viewingBooked: false,
      qualificationUpdated: false,
    },
  };

  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await anthropic().messages.create({
      model: MODELS.conversation,
      max_tokens: GENERATION.maxTokens,
      temperature: GENERATION.temperature,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    const textParts = response.content.filter(
      (c): c is Anthropic.TextBlock => c.type === "text",
    );
    const toolUses = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
    );

    if (textParts.length > 0) {
      finalText = textParts.map((t) => t.text).join("\n").trim();
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      break;
    }

    // Persist the assistant turn (including tool_use blocks) into the conversation.
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolCalls.push({ name: tu.name, input: tu.input });
      const result = await executeTool(
        tu.name,
        (tu.input ?? {}) as Record<string, unknown>,
        ctx,
      );
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result,
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  logger.info("agent.run.complete", {
    leadId: opts.leadId,
    effects: ctx.effects,
    tools: toolCalls.map((t) => t.name),
  });

  return { reply: finalText, effects: ctx.effects, toolCalls };
}

/**
 * Convert stored messages to Anthropic message params.
 * - LEAD -> user
 * - AI / HUMAN -> assistant
 * - SYSTEM -> dropped (context is captured in the system prompt)
 * Consecutive same-role messages are merged, and we ensure the array starts
 * with a user message (Anthropic requirement).
 */
function toAnthropicMessages(
  history: { role: Role; body: string }[],
): Anthropic.MessageParam[] {
  const mapped = history
    .filter((m) => m.role !== "SYSTEM")
    .map((m) => ({
      role: m.role === "LEAD" ? ("user" as const) : ("assistant" as const),
      text: m.body,
    }));

  // Drop leading assistant messages so the conversation starts with the lead.
  while (mapped.length > 0 && mapped[0].role === "assistant") {
    mapped.shift();
  }

  const merged: Anthropic.MessageParam[] = [];
  for (const m of mapped) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content as string}\n\n${m.text}`;
    } else {
      merged.push({ role: m.role, content: m.text });
    }
  }
  return merged;
}
