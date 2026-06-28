import Anthropic from "@anthropic-ai/sdk";
import { Channel, LeadStatus, Prisma, Role, type Lead, type Message } from "@prisma/client";
import { z } from "zod";

import { appConfig, CLAUDE_CONVERSATION_MODEL, env } from "@/lib/config";
import { appendMessage } from "@/lib/conversations";
import { isInsideWhatsAppCareWindow } from "@/lib/contact-hours";
import { leadFirstName } from "@/lib/lead-utils";
import { prisma } from "@/lib/prisma";
import { getPropertyDetails } from "@/lib/salesforce";

const qualificationSchema = z.object({
  budget: z.string().optional(),
  location: z.string().optional(),
  beds: z.string().optional(),
  timeline: z.string().optional(),
  buyerType: z.string().optional(),
  financing: z.string().optional(),
  viewingInterest: z.string().optional()
});

const toolSchemas = {
  get_property_details: z.object({ propertyRef: z.string().optional() }),
  update_qualification: z.object({ fields: qualificationSchema }),
  propose_viewing: z.object({ slots: z.array(z.string()).optional() }),
  book_viewing: z.object({ slot: z.string() }),
  escalate_to_human: z.object({ reason: z.string() }),
  handle_optout: z.object({})
};

export type AgentResult = {
  reply?: string;
  shouldSend: boolean;
  status?: LeadStatus;
  handoff?: boolean;
  toolCalls: string[];
};

export async function runLeadAgent(conversationId: string): Promise<AgentResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      lead: true,
      messages: {
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!conversation) {
    throw new Error(`Conversation ${conversationId} was not found.`);
  }

  if (conversation.handoff || conversation.lead.optedOut) {
    return { shouldSend: false, handoff: conversation.handoff, toolCalls: [] };
  }

  if (!isInsideWhatsAppCareWindow(conversation.lead.lastInboundAt)) {
    await appendMessage({
      conversationId,
      role: Role.SYSTEM,
      body: "AI free-form reply skipped because the WhatsApp 24-hour customer-care window is closed.",
      meta: { policy: "whatsapp_24h_window" }
    });
    return { shouldSend: false, toolCalls: [] };
  }

  if (!env("ANTHROPIC_API_KEY")) {
    const fallback =
      `Thanks ${leadFirstName(conversation.lead)}. I have logged this for ${appConfig.consultantName}, ` +
      "who will follow up with the verified details shortly.";

    return {
      reply: fallback,
      shouldSend: true,
      status: LeadStatus.ENGAGED,
      toolCalls: ["fallback_no_anthropic_key"]
    };
  }

  const anthropic = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const toolCalls: string[] = [];
  const messages: Anthropic.MessageParam[] = toAnthropicMessages(conversation.messages);

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const response = await anthropic.messages.create({
      model: CLAUDE_CONVERSATION_MODEL,
      max_tokens: 700,
      system: systemPrompt(conversation.lead),
      messages,
      tools: anthropicTools()
    });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join("\n\n");
    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUses.length === 0) {
      return {
        reply: text,
        shouldSend: Boolean(text),
        toolCalls
      };
    }

    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      toolCalls.push(toolUse.name);
      const result = await executeTool(conversation.lead, conversationId, toolUse.name, toolUse.input);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result)
      });
    }

    messages.push({ role: "user", content: toolResults });

    const optOut = toolCalls.includes("handle_optout");
    if (optOut) {
      return {
        reply: "Of course - I have opted you out and we will not contact you further.",
        shouldSend: true,
        status: LeadStatus.OPTED_OUT,
        toolCalls
      };
    }

    if (toolCalls.includes("escalate_to_human")) {
      return {
        reply: `${appConfig.consultantName} will pick this up personally from here.`,
        shouldSend: true,
        status: LeadStatus.HANDED_OFF,
        handoff: true,
        toolCalls
      };
    }
  }

  return {
    reply: `Thanks - I will ask ${appConfig.consultantName} to confirm that for you.`,
    shouldSend: true,
    status: LeadStatus.HANDED_OFF,
    handoff: true,
    toolCalls: [...toolCalls, "max_tool_iterations"]
  };
}

function systemPrompt(lead: Lead): string {
  const enquiry = lead.enquiryType ?? "their property enquiry";
  const propertyRef = lead.propertyRef ?? "not provided";

  return `
You are the AI assistant for ${appConfig.consultantName}, a senior property consultant at One Homes.
You speak with prospective buyers/renters who have just made an enquiry, over WhatsApp.

CURRENT LEAD CONTEXT
- First name: ${lead.firstName ?? "unknown"}
- Enquiry: ${enquiry}
- Property reference: ${propertyRef}
- Qualification captured so far: ${JSON.stringify(lead.qualification ?? {})}

YOUR IDENTITY & TRANSPARENCY
- In your first message, warmly introduce yourself as ${appConfig.consultantName}'s assistant and make clear you're an AI helper who can answer questions right away while ${appConfig.consultantName} is with other clients.
- Never pretend to be a human.

YOUR GOAL
- Engage instantly and warmly, answer their questions about the enquiry, qualify them, and move them toward a viewing or a call with ${appConfig.consultantName}. Be genuinely helpful, not pushy.

TONE
- Professional, warm, concise. Premium but human. Short WhatsApp-length messages. One question at a time.
- Match the lead's language and energy. Use their first name when it feels natural.

QUALIFY NATURALLY
- Budget / price range
- Location & area preferences
- Bedrooms / size
- Timeline to move
- Buyer or investor
- Financing readiness (cash / mortgage in principle)
- Viewing interest
- Record what you learn with update_qualification.

HARD RULES
- NEVER invent property facts, prices, availability, or square footage. Use get_property_details, or say you'll confirm with ${appConfig.consultantName} and not guess.
- NEVER give mortgage, financial, legal, or tax advice. Suggest speaking to a qualified adviser.
- Do not negotiate price. If they push on price/offers, use escalate_to_human.
- Escalate on complaints, legal topics, complex/unusual situations, or any request to speak to a person.
- Respect contact hours (${appConfig.contactHours}); be mindful of timezone and late-night messaging.
- If the lead sends STOP, unsubscribe, or asks to stop being contacted: call handle_optout, confirm politely, and send nothing further.
- If unsure, ask a clarifying question or escalate rather than bluffing.

HANDOFF
- When the lead is qualified and wants to proceed, propose a viewing/call. If they accept, book it or share the booking link, then summarise next steps and hand to ${appConfig.consultantName}.

Keep replies tight. Be the kind of first contact that makes someone glad they enquired.
`;
}

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages
    .filter((message) => message.role !== Role.SYSTEM)
    .map((message) => ({
      role: message.role === Role.LEAD ? "user" : "assistant",
      content: message.body
    }));
}

function anthropicTools(): Anthropic.Tool[] {
  return [
    {
      name: "get_property_details",
      description: "Fetch verified details for a property reference. Use before discussing facts, prices, availability, or square footage.",
      input_schema: {
        type: "object",
        properties: { propertyRef: { type: "string" } },
        required: []
      }
    },
    {
      name: "update_qualification",
      description: "Persist qualification fields learned from the lead.",
      input_schema: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            properties: {
              budget: { type: "string" },
              location: { type: "string" },
              beds: { type: "string" },
              timeline: { type: "string" },
              buyerType: { type: "string" },
              financing: { type: "string" },
              viewingInterest: { type: "string" }
            }
          }
        },
        required: ["fields"]
      }
    },
    {
      name: "propose_viewing",
      description: "Suggest viewing or call options. If no live calendar integration exists, return the consultant booking link.",
      input_schema: {
        type: "object",
        properties: { slots: { type: "array", items: { type: "string" } } },
        required: []
      }
    },
    {
      name: "book_viewing",
      description: "Record that the lead wants a viewing/call for a chosen slot.",
      input_schema: {
        type: "object",
        properties: { slot: { type: "string" } },
        required: ["slot"]
      }
    },
    {
      name: "escalate_to_human",
      description: "Hand off to the human consultant and pause AI replies.",
      input_schema: {
        type: "object",
        properties: { reason: { type: "string" } },
        required: ["reason"]
      }
    },
    {
      name: "handle_optout",
      description: "Opt the lead out and halt all further messaging.",
      input_schema: {
        type: "object",
        properties: {},
        required: []
      }
    }
  ];
}

async function executeTool(lead: Lead, conversationId: string, name: string, input: unknown) {
  switch (name) {
    case "get_property_details": {
      const parsed = toolSchemas.get_property_details.parse(input);
      return getPropertyDetails(parsed.propertyRef ?? lead.propertyRef ?? "");
    }
    case "update_qualification": {
      const parsed = toolSchemas.update_qualification.parse(input);
      const existing =
        lead.qualification && typeof lead.qualification === "object" && !Array.isArray(lead.qualification)
          ? (lead.qualification as Prisma.JsonObject)
          : {};
      const qualification = { ...existing, ...parsed.fields };
      const status = hasUsefulQualification(qualification) ? LeadStatus.QUALIFIED : LeadStatus.ENGAGED;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { qualification, status }
      });

      return { ok: true, qualification, status };
    }
    case "propose_viewing": {
      const parsed = toolSchemas.propose_viewing.parse(input);
      return {
        ok: true,
        slots: parsed.slots ?? [],
        calendarUrl: appConfig.consultantCalendarUrl,
        message: appConfig.consultantCalendarUrl
          ? "Share the booking link if the lead wants to choose a time."
          : "No booking link configured; ask for availability and escalate to the consultant."
      };
    }
    case "book_viewing": {
      const parsed = toolSchemas.book_viewing.parse(input);
      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: LeadStatus.VIEWING_BOOKED,
          qualification: mergeQualification(lead.qualification, { viewingInterest: `Requested: ${parsed.slot}` })
        }
      });
      await prisma.conversation.update({ where: { id: conversationId }, data: { handoff: true } });
      return { ok: true, bookedSlot: parsed.slot, calendarUrl: appConfig.consultantCalendarUrl };
    }
    case "escalate_to_human": {
      const parsed = toolSchemas.escalate_to_human.parse(input);
      await prisma.conversation.update({ where: { id: conversationId }, data: { handoff: true } });
      await prisma.lead.update({ where: { id: lead.id }, data: { status: LeadStatus.HANDED_OFF } });
      return { ok: true, reason: parsed.reason };
    }
    case "handle_optout": {
      await prisma.conversation.update({ where: { id: conversationId }, data: { handoff: true } });
      await prisma.lead.update({
        where: { id: lead.id },
        data: { optedOut: true, status: LeadStatus.OPTED_OUT }
      });
      return { ok: true };
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

function mergeQualification(existing: Prisma.JsonValue | null, patch: Prisma.JsonObject): Prisma.JsonObject {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Prisma.JsonObject) : {};
  return { ...base, ...patch };
}

function hasUsefulQualification(qualification: Prisma.JsonObject): boolean {
  const keys = ["budget", "location", "beds", "timeline", "buyerType", "financing", "viewingInterest"];
  return keys.filter((key) => Boolean(qualification[key])).length >= 3;
}

export function isOptOutText(body: string): boolean {
  return /\b(stop|unsubscribe|opt\s*out|do not contact|don't contact)\b/i.test(body.trim());
}

export function agentMessageMeta(result: AgentResult): Prisma.InputJsonObject {
  return {
    toolCalls: result.toolCalls,
    model: env("ANTHROPIC_API_KEY") ? CLAUDE_CONVERSATION_MODEL : "fallback"
  };
}

export async function createEmailConversationMessage(leadId: string, body: string, providerMessageId?: string) {
  const conversation = await prisma.conversation.create({
    data: {
      leadId,
      channel: Channel.EMAIL
    }
  });
  return appendMessage({
    conversationId: conversation.id,
    role: Role.AI,
    body,
    providerMessageId,
    meta: { channel: "email" }
  });
}
