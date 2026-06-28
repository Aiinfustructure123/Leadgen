/**
 * Claude conversation agent — the heart of the system.
 *
 * On each inbound WhatsApp message:
 *  1. Load lead + full message history
 *  2. Call Claude with system prompt + history + tools
 *  3. Execute any tool calls
 *  4. Return the text reply to send back
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "./prisma";
import { AI_MODELS, CONSULTANT_NAME, CONSULTANT_CALENDAR_URL, CONTACT_HOURS } from "./config";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildSystemPrompt(): string {
  return `You are the AI assistant for ${CONSULTANT_NAME}, a senior property consultant at One Homes.
You speak with prospective buyers/renters who have just made an enquiry, over WhatsApp.

YOUR IDENTITY & TRANSPARENCY
- In your first message, warmly introduce yourself as ${CONSULTANT_NAME}'s assistant and make clear
  you're an AI helper who can answer questions right away while ${CONSULTANT_NAME} is with other clients.
  Never pretend to be a human.

YOUR GOAL
- Engage instantly and warmly, answer their questions about the enquiry, qualify them, and move them
  toward a viewing or a call with ${CONSULTANT_NAME}. Be genuinely helpful, not pushy.

TONE
- Professional, warm, concise. Premium but human. Short WhatsApp-length messages. One question at a time.
  Match the lead's language and energy. Use their first name.

QUALIFY (naturally, over the conversation — never interrogate):
- Budget / price range  • Location & area preferences  • Bedrooms / size  • Timeline to move
- Buyer or investor  • Financing readiness (cash / mortgage in principle)  • Viewing interest
Record what you learn with the update_qualification tool.

HARD RULES
- NEVER invent property facts, prices, availability, or square footage. Use get_property_details, or say
  you'll confirm with ${CONSULTANT_NAME} and not guess.
- NEVER give mortgage, financial, legal, or tax advice. Suggest speaking to a qualified adviser.
- Don't negotiate price. If they push on price/offers, use escalate_to_human.
- Escalate on: complaints, anything legal, complex/unusual situations, or any request to speak to a person.
- Respect contact hours (${CONTACT_HOURS}); be mindful of timezone and late-night messaging.
- If the lead sends STOP / "unsubscribe" / asks to stop being contacted: call handle_optout, confirm
  politely, and send nothing further.
- If unsure, ask a clarifying question or escalate rather than bluffing.

HANDOFF
- When the lead is qualified and wants to proceed, propose a viewing/call. If they accept, book it or
  share the booking link (${CONSULTANT_CALENDAR_URL || "I'll have " + CONSULTANT_NAME + " reach out to schedule"}),
  then summarise next steps and hand to ${CONSULTANT_NAME}.

Keep replies tight. Be the kind of first contact that makes someone glad they enquired.`;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_property_details",
    description:
      "Fetch details about a specific property (price, size, bedrooms, features, availability). " +
      "Always call this instead of guessing. Returns structured property information.",
    input_schema: {
      type: "object",
      properties: {
        propertyRef: {
          type: "string",
          description: "The property reference number or identifier",
        },
      },
      required: ["propertyRef"],
    },
  },
  {
    name: "update_qualification",
    description:
      "Persist qualification data gathered during the conversation. " +
      "Call this whenever you learn something new about the lead's requirements.",
    input_schema: {
      type: "object",
      properties: {
        budget: { type: "string", description: "Budget or price range, e.g. '£800k–£1.2m'" },
        beds: { type: "string", description: "Number of bedrooms required, e.g. '2-3'" },
        location: { type: "string", description: "Preferred area(s), e.g. 'Marylebone, Fitzrovia'" },
        timeline: { type: "string", description: "When they want to move, e.g. 'Within 3 months'" },
        buyerType: { type: "string", enum: ["buyer", "investor", "renter", "unknown"] },
        financing: { type: "string", description: "Cash buyer, mortgage in principle, or unknown" },
        viewingInterest: { type: "string", enum: ["yes", "no", "maybe", "unknown"] },
      },
    },
  },
  {
    name: "propose_viewing",
    description:
      "Propose available viewing slots to the lead or share the booking calendar URL. " +
      "Use this when the lead expresses interest in viewing.",
    input_schema: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          items: { type: "string" },
          description: "ISO 8601 datetime strings for available slots",
        },
        propertyRef: { type: "string", description: "Property to view" },
      },
    },
  },
  {
    name: "book_viewing",
    description: "Confirm a viewing booking for a specific slot.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", description: "ISO 8601 datetime of the confirmed slot" },
        propertyRef: { type: "string", description: "Property to view" },
      },
      required: ["slot"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to the human consultant. Use for: price negotiation requests, " +
      "complaints, legal questions, complex situations, or when the lead explicitly asks to " +
      "speak with a person. Once called, stop sending AI replies.",
    input_schema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief reason for escalation",
        },
      },
      required: ["reason"],
    },
  },
  {
    name: "handle_optout",
    description:
      "Process an opt-out request when the lead sends STOP, unsubscribe, or asks to stop " +
      "being contacted. Halts all further messaging.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

export interface AgentResult {
  reply: string;
  toolsExecuted: string[];
  escalated: boolean;
  optedOut: boolean;
  qualification?: Record<string, string>;
  viewingBooked?: boolean;
}

export async function runAgent(
  leadId: string,
  conversationId: string
): Promise<AgentResult> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
  });

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
  });

  const history: Anthropic.MessageParam[] = messages
    .filter((m: { role: string }) => m.role !== "SYSTEM")
    .map((m: { role: string; body: string }) => ({
      role: (m.role === "LEAD" ? "user" : "assistant") as "user" | "assistant",
      content: m.body,
    }));

  const result: AgentResult = {
    reply: "",
    toolsExecuted: [],
    escalated: false,
    optedOut: false,
    qualification: {},
    viewingBooked: false,
  };

  let continueLoop = true;
  let currentMessages = [...history];

  while (continueLoop) {
    const response = await anthropic.messages.create({
      model: AI_MODELS.conversation,
      max_tokens: 1024,
      system: buildSystemPrompt(),
      tools: TOOLS,
      messages: currentMessages,
    });

    // Process the response content
    let textReply = "";
    const toolUses: Anthropic.ToolUseBlock[] = [];

    for (const block of response.content) {
      if (block.type === "text") {
        textReply += block.text;
      } else if (block.type === "tool_use") {
        toolUses.push(block);
      }
    }

    if (toolUses.length === 0 || response.stop_reason === "end_turn") {
      result.reply = textReply;
      continueLoop = false;
      break;
    }

    // Execute tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      result.toolsExecuted.push(toolUse.name);
      const toolResult = await executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>,
        leadId,
        conversationId,
        lead,
        result
      );

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      });
    }

    // Add assistant turn with tool uses + user turn with results
    currentMessages = [
      ...currentMessages,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];

    // If stop_reason was tool_use, loop; otherwise done
    if (response.stop_reason !== "tool_use") {
      if (textReply) result.reply = textReply;
      continueLoop = false;
    }
  }

  return result;
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  leadId: string,
  conversationId: string,
  lead: { id: string; propertyRef?: string | null; qualification?: unknown },
  result: AgentResult
): Promise<unknown> {
  switch (name) {
    case "get_property_details": {
      const ref = (input.propertyRef as string) || lead.propertyRef;
      if (!ref) {
        return { error: "No property reference provided" };
      }
      // In production, query your Salesforce/DB for property details.
      // Stub returns a clear "not found" so the AI handles it gracefully.
      return {
        propertyRef: ref,
        status: "details_not_available",
        message:
          "Property details are not available in the database at this time. " +
          "Please tell the lead you will confirm with the consultant directly.",
      };
    }

    case "update_qualification": {
      const existing =
        typeof lead.qualification === "object" && lead.qualification !== null
          ? (lead.qualification as Record<string, string>)
          : {};

      const updated = { ...existing, ...(input as Record<string, string>) };
      result.qualification = updated;

      await prisma.lead.update({
        where: { id: leadId },
        data: { qualification: updated },
      });

      return { success: true, qualification: updated };
    }

    case "propose_viewing": {
      const calendarUrl = CONSULTANT_CALENDAR_URL;
      return {
        success: true,
        calendarUrl: calendarUrl || null,
        slots: input.slots ?? [],
        message: calendarUrl
          ? `Share this booking link: ${calendarUrl}`
          : "No calendar URL configured; consultant will reach out directly.",
      };
    }

    case "book_viewing": {
      result.viewingBooked = true;

      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "VIEWING_BOOKED" },
      });

      await prisma.message.create({
        data: {
          conversationId,
          role: "SYSTEM",
          body: `Viewing booked for slot: ${input.slot}`,
          meta: { slot: String(input.slot), propertyRef: String(input.propertyRef ?? "") },
        },
      });

      return { success: true, slot: input.slot, confirmationSent: true };
    }

    case "escalate_to_human": {
      result.escalated = true;

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { handoff: true },
      });

      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "HANDED_OFF" },
      });

      await prisma.message.create({
        data: {
          conversationId,
          role: "SYSTEM",
          body: `Escalated to human: ${input.reason}`,
          meta: { reason: String(input.reason ?? "") },
        },
      });

      return { success: true, reason: input.reason };
    }

    case "handle_optout": {
      result.optedOut = true;

      await prisma.lead.update({
        where: { id: leadId },
        data: { status: "OPTED_OUT", optedOut: true },
      });

      await prisma.message.create({
        data: {
          conversationId,
          role: "SYSTEM",
          body: "Lead opted out",
          meta: { optout: true },
        },
      });

      return { success: true };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/**
 * Generate a concise summary of the conversation for Salesforce logging.
 */
export async function summariseConversation(conversationId: string): Promise<string> {
  const messages = await prisma.message.findMany({
    where: { conversationId, role: { in: ["LEAD", "AI"] } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const transcript = messages
    .map((m: { role: string; body: string }) => `${m.role === "LEAD" ? "Lead" : "AI"}: ${m.body}`)
    .join("\n");

  const response = await anthropic.messages.create({
    model: AI_MODELS.classification,
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Summarise this WhatsApp property enquiry conversation in 3-5 bullet points 
for a CRM activity note. Focus on: what they want, qualification data gathered, 
outcome (viewing booked / handed off / opted out / ongoing), and any key points for the consultant.

Transcript:
${transcript}

Respond with bullet points only.`,
      },
    ],
  });

  const block = response.content[0];
  return block.type === "text" ? block.text : "No summary available.";
}
