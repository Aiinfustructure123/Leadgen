import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlockParam,
  MessageParam,
  TextBlock,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { z } from "zod";

import { AI_MODELS, getCalendarUrl, getConsultantName, getContactHours, getEnv } from "@/lib/config";
import { prisma } from "@/lib/db";
import { markOptedOut, mergeQualification } from "@/lib/leads";
import { getSalesforcePropertyDetails } from "@/lib/salesforce";
import type { Conversation, Lead, Message } from "@/generated/prisma/client";

const qualificationSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
});

const propertyDetailsSchema = z.object({
  propertyRef: z.string().min(1),
});

const viewingSchema = z.object({
  slots: z.array(z.string()).default([]),
});

const bookViewingSchema = z.object({
  slot: z.string().min(1),
});

const escalationSchema = z.object({
  reason: z.string().min(1),
});

export type AgentResult = {
  reply: string | null;
  toolCalls: Array<{ name: string; input: unknown; result: unknown }>;
  handoff: boolean;
  optedOut: boolean;
};

export async function runAgentLoop({
  lead,
  conversation,
  messages,
}: {
  lead: Lead;
  conversation: Conversation;
  messages: Message[];
}): Promise<AgentResult> {
  const anthropic = new Anthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });
  const transcript: MessageParam[] = buildTranscript(messages);
  const toolCalls: AgentResult["toolCalls"] = [];

  for (let index = 0; index < 4; index += 1) {
    const response = await anthropic.messages.create({
      model: AI_MODELS.conversation,
      max_tokens: 700,
      system: buildSystemPrompt(lead),
      messages: transcript,
      tools,
      tool_choice: { type: "auto" },
      metadata: { user_id: lead.id },
    });

    const toolUseBlocks = response.content.filter(isToolUseBlock);

    if (toolUseBlocks.length === 0) {
      return {
        reply: extractText(response.content),
        toolCalls,
        handoff: await isConversationInHandoff(conversation.id),
        optedOut: await isLeadOptedOut(lead.id),
      };
    }

    transcript.push({
      role: "assistant",
      content: response.content.map((block) => block as ContentBlockParam),
    });

    const toolResults: ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input, lead, conversation);
      toolCalls.push({ name: block.name, input: block.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    transcript.push({
      role: "user",
      content: toolResults,
    });
  }

  await escalateToHuman(conversation.id, lead.id, "Agent reached tool iteration limit.");
  return {
    reply: `I am going to ask ${getConsultantName()} to pick this up directly so we can make sure you get the right answer.`,
    toolCalls,
    handoff: true,
    optedOut: false,
  };
}

export async function summarizeConversation(messages: Message[]): Promise<string> {
  if (messages.length === 0) {
    return "No conversation messages recorded yet.";
  }

  const anthropic = new Anthropic({ apiKey: getEnv("ANTHROPIC_API_KEY") });
  const transcript = messages.map((message) => `${message.role}: ${message.body}`).join("\n");
  const response = await anthropic.messages.create({
    model: AI_MODELS.classifier,
    max_tokens: 250,
    system:
      "Summarise this One Homes lead conversation for Salesforce. Include qualification, intent, risks, next step, and whether a human should follow up. Be concise.",
    messages: [{ role: "user", content: transcript }],
  });

  return extractText(response.content) || "Conversation summary unavailable.";
}

const tools: Tool[] = [
  {
    name: "get_property_details",
    description:
      "Fetch verified property facts for a One Homes enquiry. Use this before answering about price, bedrooms, availability, size, or facts.",
    input_schema: {
      type: "object",
      properties: {
        propertyRef: { type: "string" },
      },
      required: ["propertyRef"],
    },
  },
  {
    name: "update_qualification",
    description:
      "Persist qualification details learned naturally from the lead: budget, beds, location, timeline, buyerType, financing, and viewingInterest.",
    input_schema: {
      type: "object",
      properties: {
        fields: {
          type: "object",
          additionalProperties: true,
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "propose_viewing",
    description:
      "Surface viewing or call options. Use the consultant calendar URL when live availability is not connected.",
    input_schema: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["slots"],
    },
  },
  {
    name: "book_viewing",
    description: "Record a viewing or call slot the lead has accepted.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string" },
      },
      required: ["slot"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to the human consultant for complaints, legal/financial advice, negotiation, unusual situations, or requests for a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
      required: ["reason"],
    },
  },
  {
    name: "handle_optout",
    description: "Mark the lead as opted out and stop all future AI messaging.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

async function executeTool(
  name: string,
  input: unknown,
  lead: Lead,
  conversation: Conversation,
): Promise<unknown> {
  switch (name) {
    case "get_property_details": {
      const { propertyRef } = propertyDetailsSchema.parse(input);
      const property = await prisma.property.findUnique({ where: { ref: propertyRef } });

      if (property) {
        return {
          found: true,
          source: "database",
          property,
        };
      }

      const salesforceRecord = await getSalesforcePropertyDetails(propertyRef);
      return salesforceRecord
        ? { found: true, source: "salesforce", property: salesforceRecord }
        : { found: false, message: "No verified property facts found. Do not guess." };
    }
    case "update_qualification": {
      const { fields } = qualificationSchema.parse(input);
      const updated = await mergeQualification(lead.id, fields);
      return { saved: true, qualification: updated.qualification };
    }
    case "propose_viewing": {
      const { slots } = viewingSchema.parse(input);
      return {
        slots,
        calendarUrl: getCalendarUrl(),
        instruction: "Offer one clear next step. If no slots are provided, share the calendar URL if present.",
      };
    }
    case "book_viewing": {
      const { slot } = bookViewingSchema.parse(input);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "VIEWING_BOOKED" },
      });
      return { booked: true, slot };
    }
    case "escalate_to_human": {
      const { reason } = escalationSchema.parse(input);
      await escalateToHuman(conversation.id, lead.id, reason);
      return { escalated: true, reason };
    }
    case "handle_optout": {
      await markOptedOut(lead.id);
      return { optedOut: true };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function escalateToHuman(conversationId: string, leadId: string, reason: string) {
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { handoff: true },
    }),
    prisma.lead.update({
      where: { id: leadId },
      data: { status: "HANDED_OFF" },
    }),
    prisma.message.create({
      data: {
        conversationId,
        role: "SYSTEM",
        body: `Escalated to human: ${reason}`,
      },
    }),
  ]);
}

function buildTranscript(messages: Message[]): MessageParam[] {
  return messages
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => ({
      role: message.role === "LEAD" ? "user" : "assistant",
      content: message.body,
    }));
}

function buildSystemPrompt(lead: Lead): string {
  const consultantName = getConsultantName();
  const leadName = lead.firstName || "there";

  return `You are the AI assistant for ${consultantName}, a senior property consultant at One Homes.
You speak with prospective buyers/renters who have just made an enquiry, over WhatsApp.

Lead context:
- First name: ${leadName}
- Enquiry: ${lead.enquiryType || "unknown"}
- Property reference: ${lead.propertyRef || "unknown"}
- Contact hours: ${getContactHours()}

YOUR IDENTITY & TRANSPARENCY
- In your first message, warmly introduce yourself as ${consultantName}'s assistant and make clear you're an AI helper who can answer questions right away while ${consultantName} is with other clients. Never pretend to be a human.

YOUR GOAL
- Engage instantly and warmly, answer their questions about the enquiry, qualify them, and move them toward a viewing or a call with ${consultantName}. Be genuinely helpful, not pushy.

TONE
- Professional, warm, concise. Premium but human. Short WhatsApp-length messages. One question at a time. Match the lead's language and energy. Use their first name when natural.

QUALIFY naturally over the conversation, never interrogate:
- Budget / price range
- Location & area preferences
- Bedrooms / size
- Timeline to move
- Buyer or investor
- Financing readiness
- Viewing interest
Record what you learn with update_qualification.

HARD RULES
- NEVER invent property facts, prices, availability, or square footage. Use get_property_details, or say you'll confirm with ${consultantName} and do not guess.
- NEVER give mortgage, financial, legal, or tax advice. Suggest speaking to a qualified adviser.
- Do not negotiate price. If they push on price/offers, use escalate_to_human.
- Escalate on complaints, legal issues, complex/unusual situations, or any request to speak to a person.
- Respect contact hours and late-night messaging.
- If the lead asks to stop being contacted, use handle_optout.
- If unsure, ask a clarifying question or escalate rather than bluffing.

HANDOFF
- When the lead is qualified and wants to proceed, propose a viewing/call. If they accept, book it or share the booking link, then summarise next steps and hand to ${consultantName}.

Keep replies tight. Be the kind of first contact that makes someone glad they enquired.`;
}

function extractText(content: Array<TextBlock | { type: string }>): string {
  return content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function isToolUseBlock(block: { type: string }): block is ToolUseBlock {
  return block.type === "tool_use";
}

async function isConversationInHandoff(conversationId: string): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  return conversation?.handoff ?? false;
}

async function isLeadOptedOut(leadId: string): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  return lead?.optedOut ?? false;
}
