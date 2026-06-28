import type Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "../anthropic";
import { AI, MODELS } from "../config";
import { logger } from "../logger";
import { buildSystemPrompt } from "./prompt";
import {
  TOOL_DEFINITIONS,
  executeTool,
  mergeEffects,
  type ToolContext,
  type ToolOutcome,
} from "./tools";
import type { Lead, Message } from "@prisma/client";

export interface AgentResult {
  /** Text to send back to the lead (may be empty if only tools ran). */
  reply: string;
  /** Accumulated side effects from tool calls. */
  effects: ToolOutcome["effects"];
  /** Tool calls made, for logging into Message.meta. */
  toolCalls: { name: string; input: unknown }[];
}

/** Map our stored Message rows into Anthropic message-history turns. */
function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  const result: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (!m.body.trim()) continue;
    if (m.role === "LEAD") {
      result.push({ role: "user", content: m.body });
    } else if (m.role === "AI" || m.role === "HUMAN") {
      // Human consultant messages are presented as assistant turns so the
      // model has continuity, but the model won't impersonate them going fwd.
      result.push({ role: "assistant", content: m.body });
    }
    // SYSTEM messages are internal notes; skip from model history.
  }
  // Anthropic requires the first message to be from the user.
  while (result.length && result[0].role !== "user") result.shift();
  return result;
}

/**
 * Run the agent for one inbound turn. Loads no DB itself for messages — the
 * caller passes the full ordered history (including the just-received inbound).
 */
export async function runAgent(
  lead: Lead,
  history: Message[]
): Promise<AgentResult> {
  const system = buildSystemPrompt(lead);
  const ctx: ToolContext = { lead, conversationId: history[0]?.conversationId ?? "" };

  const messages = toAnthropicMessages(history);
  if (messages.length === 0) {
    // Nothing to respond to.
    return { reply: "", effects: {}, toolCalls: [] };
  }

  let accumulatedEffects: ToolOutcome["effects"] = {};
  const toolCalls: { name: string; input: unknown }[] = [];
  let finalText = "";

  const client = anthropic();

  for (let iter = 0; iter < AI.maxToolIterations; iter++) {
    const response: Anthropic.Message = await client.messages.create({
      model: MODELS.CONVERSATION,
      max_tokens: AI.maxTokens,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // Collect text + tool_use blocks.
    const textParts: string[] = [];
    const toolUses: Anthropic.ToolUseBlock[] = [];
    for (const block of response.content) {
      if (block.type === "text") textParts.push(block.text);
      else if (block.type === "tool_use") toolUses.push(block);
    }
    if (textParts.length) finalText = textParts.join("\n").trim();

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      break;
    }

    // Append the assistant turn (with tool_use) to history.
    messages.push({ role: "assistant", content: response.content });

    // Execute each tool call and build tool_result blocks.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      toolCalls.push({ name: tu.name, input: tu.input });
      const outcome = await executeTool(
        tu.name,
        (tu.input as Record<string, unknown>) ?? {},
        ctx
      );
      accumulatedEffects = mergeEffects(accumulatedEffects, outcome.effects);
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(outcome.result),
      });
    }
    messages.push({ role: "user", content: toolResults });

    // If a terminal effect (opt-out/escalate) fired, let the model produce one
    // final confirmation message on the next loop, then we stop.
  }

  logger.info("agent.completed", {
    leadId: lead.id,
    toolCalls: toolCalls.map((t) => t.name),
    hasReply: Boolean(finalText),
  });

  return { reply: finalText, effects: accumulatedEffects, toolCalls };
}
