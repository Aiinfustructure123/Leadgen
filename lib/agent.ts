import Anthropic from "@anthropic-ai/sdk";
import { LeadStatus, Role } from "@prisma/client";

import { BUSINESS_CONFIG, MODEL_CONFIG } from "@/lib/config";
import {
  appendMessage,
  setConversationHandoff,
  setLeadOptedOut,
  updateLeadQualification,
} from "@/lib/lead-service";
import { prisma } from "@/lib/prisma";
import { requireEnv } from "@/lib/env";

const TOOL_DEFINITIONS = [
  {
    name: "get_property_details",
    description:
      "Fetch verified property facts by propertyRef. Never answer with invented values when facts are missing.",
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
    description: "Update the lead's qualification fields.",
    input_schema: {
      type: "object",
      properties: {
        budget: { type: "string" },
        beds: { type: "string" },
        location: { type: "string" },
        timeline: { type: "string" },
        buyerType: { type: "string" },
        financing: { type: "string" },
        viewingInterest: { type: "string" },
      },
    },
  },
  {
    name: "propose_viewing",
    description: "Propose viewing options or offer consultant booking link.",
    input_schema: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  },
  {
    name: "book_viewing",
    description: "Confirm and record a chosen viewing slot.",
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
    description: "Escalate conversation to the human consultant and halt AI responses.",
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
    description: "Mark lead as opted out and stop all future messaging.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
] as const;

type AgentOutcome = {
  reply?: string;
  escalated: boolean;
  optedOut: boolean;
  viewingBooked: boolean;
};

function getAnthropicClient() {
  return new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

function buildSystemPrompt() {
  const consultantName = BUSINESS_CONFIG.consultantName;
  return `You are the AI assistant for ${consultantName}, a senior property consultant at One Homes.
You speak with prospective buyers/renters who have made an enquiry over WhatsApp.

YOUR IDENTITY & TRANSPARENCY
- In your first message, warmly introduce yourself as ${consultantName}'s assistant and clearly state that you are an AI helper.
- Never pretend to be human.

YOUR GOAL
- Engage quickly, answer enquiry questions, qualify naturally, and move toward viewing or a call.

TONE
- Professional, warm, concise, premium and human.
- Keep WhatsApp-friendly short replies.
- Ask one question at a time.

QUALIFY NATURALLY
- Budget/price range, location preferences, bedrooms/size, timeline to move, buyer or investor, financing readiness, viewing interest.
- Use update_qualification whenever you learn these facts.

HARD RULES
- Never invent property details, prices, availability, or dimensions. Use get_property_details or clearly say you'll confirm.
- Never provide financial/legal/tax advice.
- If lead pushes negotiation or offer handling, escalate_to_human.
- Escalate for complaints, legal/complex edge-cases, or explicit request to speak to a person.
- Respect contact hours (${BUSINESS_CONFIG.contactHours}).
- On STOP/unsubscribe requests, call handle_optout, confirm politely, and stop.
- If unsure, ask a clarifying question or escalate.

HANDOFF
- If qualified and ready, propose viewing/call. If accepted, book and summarise next steps.`;
}

function mapHistoryToAnthropic(
  messages: Array<{ role: Role; body: string }>,
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages.map((message) => {
    if (message.role === Role.LEAD) {
      return { role: "user", content: message.body };
    }
    if (message.role === Role.HUMAN) {
      return { role: "assistant", content: `[Human Consultant]: ${message.body}` };
    }
    return { role: "assistant", content: message.body };
  });
}

async function executeTool({
  toolName,
  toolInput,
  leadId,
  conversationId,
}: {
  toolName: string;
  toolInput: Record<string, unknown>;
  leadId: string;
  conversationId: string;
}): Promise<{ result: Record<string, unknown>; escalated?: boolean; optedOut?: boolean; viewingBooked?: boolean }> {
  switch (toolName) {
    case "get_property_details": {
      const propertyRef = String(toolInput.propertyRef ?? "");
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        select: { propertyRef: true, enquiryType: true },
      });
      return {
        result: {
          propertyRef: propertyRef || lead?.propertyRef,
          enquiryType: lead?.enquiryType,
          note: "Only verified local records are returned. Live listing facts should be confirmed with consultant/Salesforce.",
        },
      };
    }
    case "update_qualification": {
      await updateLeadQualification(leadId, {
        budget: stringifyField(toolInput.budget),
        beds: stringifyField(toolInput.beds),
        location: stringifyField(toolInput.location),
        timeline: stringifyField(toolInput.timeline),
        buyerType: stringifyField(toolInput.buyerType),
        financing: stringifyField(toolInput.financing),
        viewingInterest: stringifyField(toolInput.viewingInterest),
      });
      return { result: { ok: true } };
    }
    case "propose_viewing": {
      return {
        result: {
          slots: Array.isArray(toolInput.slots) ? toolInput.slots : [],
          fallbackCalendarUrl: BUSINESS_CONFIG.consultantCalendarUrl,
        },
      };
    }
    case "book_viewing": {
      const slot = String(toolInput.slot ?? "");
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          viewingBooked: true,
          status: LeadStatus.VIEWING_BOOKED,
          lastActivityAt: new Date(),
        },
      });
      return {
        result: {
          booked: true,
          slot,
          nextStep: BUSINESS_CONFIG.consultantCalendarUrl,
        },
        viewingBooked: true,
      };
    }
    case "escalate_to_human": {
      const reason = String(toolInput.reason ?? "Lead requested human support");
      await setConversationHandoff(conversationId, reason);
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: LeadStatus.HANDED_OFF, lastActivityAt: new Date() },
      });
      return { result: { escalated: true, reason }, escalated: true };
    }
    case "handle_optout": {
      await setLeadOptedOut(leadId);
      return { result: { optedOut: true }, optedOut: true };
    }
    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

function stringifyField(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return undefined;
}

export async function runAgentTurn({
  leadId,
  conversationId,
}: {
  leadId: string;
  conversationId: string;
}): Promise<AgentOutcome> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: true,
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation || conversation.handoff || conversation.lead.optedOut) {
    return { escalated: Boolean(conversation?.handoff), optedOut: Boolean(conversation?.lead.optedOut), viewingBooked: false };
  }

  const anthropic = getAnthropicClient();
  const transcript = mapHistoryToAnthropic(
    conversation.messages.map((message) => ({ role: message.role, body: message.body })),
  );

  let workingMessages: Array<Record<string, unknown>> = [...transcript];
  let finalReply = "";
  let escalated = false;
  let optedOut = false;
  let viewingBooked = false;

  for (let pass = 0; pass < 3; pass += 1) {
    const response = await anthropic.messages.create({
      model: MODEL_CONFIG.conversationModel,
      max_tokens: 700,
      system: buildSystemPrompt(),
      messages: workingMessages as Anthropic.MessageParam[],
      tools: TOOL_DEFINITIONS as unknown as Anthropic.Tool[],
    });

    const textParts = response.content
      .filter((item) => item.type === "text")
      .map((item) => item.text.trim())
      .filter(Boolean);
    const toolCalls = response.content.filter((item) => item.type === "tool_use");

    if (toolCalls.length === 0) {
      finalReply = textParts.join("\n").trim();
      break;
    }

    workingMessages.push({
      role: "assistant",
      content: response.content as unknown as string,
    });

    for (const toolCall of toolCalls) {
      const executed = await executeTool({
        toolName: toolCall.name,
        toolInput: (toolCall.input as Record<string, unknown>) ?? {},
        leadId,
        conversationId,
      });
      escalated ||= Boolean(executed.escalated);
      optedOut ||= Boolean(executed.optedOut);
      viewingBooked ||= Boolean(executed.viewingBooked);

      workingMessages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolCall.id,
            content: JSON.stringify(executed.result),
          },
        ],
      });
    }
  }

  if (!escalated && !optedOut && finalReply) {
    const disclosureMissing = !conversation.firstDisclosureAt;
    const leadName = conversation.lead.firstName ?? "there";
    const disclosure = `Hi ${leadName} — I'm ${BUSINESS_CONFIG.consultantName}'s AI assistant at One Homes. `;
    const withDisclosure = disclosureMissing ? `${disclosure}${finalReply}` : finalReply;

    await appendMessage({
      conversationId,
      role: Role.AI,
      body: withDisclosure,
      meta: {
        model: MODEL_CONFIG.conversationModel,
      },
    });

    if (disclosureMissing) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { firstDisclosureAt: new Date() },
      });
    }

    return { reply: withDisclosure, escalated, optedOut, viewingBooked };
  }

  return { escalated, optedOut, viewingBooked };
}
