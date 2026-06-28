import Anthropic from "@anthropic-ai/sdk";
import type { ContentBlockParam, MessageParam } from "@anthropic-ai/sdk/resources/messages";

import { anthropicTools, runAgentTool } from "@/lib/agent/tools";
import { buildAgentSystemPrompt } from "@/lib/agent/system-prompt";
import { assertEnv, env } from "@/lib/config";
import { prisma } from "@/lib/prisma";

const classifierSchema = `Return JSON with shape:
{"needsHuman": boolean, "isOptOut": boolean, "intent": string, "confidence": number}
No extra keys.`;

function createClient() {
  return new Anthropic({ apiKey: assertEnv("ANTHROPIC_API_KEY") });
}

function toAnthropicMessages(messages: { role: string; body: string }[]): MessageParam[] {
  return messages.map((message) => {
    if (message.role === "LEAD") {
      return { role: "user", content: message.body };
    }

    return {
      role: "assistant",
      content: message.body,
    };
  });
}

function extractText(blocks: Array<{ type: string; text?: string }>) {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}

async function classifyInboundMessage(body: string) {
  try {
    const client = createClient();
    const result = await client.messages.create({
      model: env.ANTHROPIC_CLASSIFIER_MODEL,
      max_tokens: 180,
      system: classifierSchema,
      messages: [{ role: "user", content: body }],
    });

    const text = extractText(result.content as Array<{ type: string; text?: string }>);
    const parsed = JSON.parse(text) as {
      needsHuman: boolean;
      isOptOut: boolean;
      intent: string;
      confidence: number;
    };

    return parsed;
  } catch {
    return {
      needsHuman: false,
      isOptOut: false,
      intent: "unknown",
      confidence: 0,
    };
  }
}

function prependDisclosureIfNeeded(args: {
  leadFirstName: string | null;
  disclosureSentAt: Date | null;
  text: string;
}) {
  if (args.disclosureSentAt) {
    return args.text;
  }

  const greetingName = args.leadFirstName ? ` ${args.leadFirstName}` : "";
  return `Hi${greetingName} — I'm ${env.CONSULTANT_NAME}'s AI assistant at One Homes. I can help right away while ${env.CONSULTANT_NAME} is with other clients.\n\n${args.text}`;
}

export async function runConversationAgent(args: {
  leadId: string;
  conversationId: string;
  inboundMessageId: string;
}) {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: args.leadId },
    include: {
      conversations: {
        where: { id: args.conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  const conversation = lead.conversations[0];
  if (!conversation || conversation.handoff || lead.optedOut || lead.manualOverride) {
    return { skipped: true as const };
  }

  const inbound = conversation.messages.find((message) => message.id === args.inboundMessageId);
  if (!inbound) {
    return { skipped: true as const };
  }

  const classification = await classifyInboundMessage(inbound.body);
  if (classification.needsHuman && classification.confidence >= 0.8) {
    await runAgentTool("escalate_to_human", { reason: `Classifier intent: ${classification.intent}` }, args);
    return {
      skipped: false as const,
      reply: `Thanks for the context. I'll have ${env.CONSULTANT_NAME} follow up directly to help with this.`,
      toolMeta: [{ name: "escalate_to_human", input: classification }],
    };
  }

  const client = createClient();
  const baseMessages = toAnthropicMessages(
    conversation.messages.map((message) => ({ role: message.role, body: message.body })),
  );

  const firstResponse = await client.messages.create({
    model: env.ANTHROPIC_LIVE_MODEL,
    max_tokens: 500,
    system: buildAgentSystemPrompt(),
    tools: anthropicTools,
    messages: baseMessages,
  });

  const firstBlocks = firstResponse.content as Array<{
    id?: string;
    type: string;
    text?: string;
    name?: string;
    input?: unknown;
  }>;

  const toolCalls = firstBlocks.filter((block) => block.type === "tool_use" && block.name);
  let replyText = extractText(firstBlocks);
  const toolMeta: Array<{ name: string; input: unknown; output: unknown }> = [];

  if (toolCalls.length > 0) {
    const toolResults = [];

    for (const call of toolCalls) {
      const output = await runAgentTool(call.name!, call.input, args);
      toolMeta.push({ name: call.name!, input: call.input, output });
      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id!,
        content: JSON.stringify(output),
      });
    }

    const secondResponse = await client.messages.create({
      model: env.ANTHROPIC_LIVE_MODEL,
      max_tokens: 500,
      system: buildAgentSystemPrompt(),
      tools: anthropicTools,
      messages: [
        ...baseMessages,
        { role: "assistant", content: firstBlocks as ContentBlockParam[] },
        { role: "user", content: toolResults as ContentBlockParam[] },
      ],
    });

    replyText = extractText(secondResponse.content as Array<{ type: string; text?: string }>);
  }

  const reply = prependDisclosureIfNeeded({
    leadFirstName: lead.firstName ?? null,
    disclosureSentAt: lead.aiDisclosureSentAt,
    text: replyText || "Thanks for your message — I'm checking this now.",
  });

  return {
    skipped: false as const,
    reply,
    toolMeta,
  };
}
