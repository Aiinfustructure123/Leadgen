import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../db";
import { BUSINESS } from "../config";
import { logger } from "../logger";
import { mergeQualification, QualificationSchema, type Qualification } from "../qualification";
import { fetchPropertyFromSalesforce } from "../salesforce";
import type { Lead } from "@prisma/client";

/** Anthropic tool definitions advertised to the model. */
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_property_details",
    description:
      "Fetch authoritative facts about a property (price, beds, area, size, status, features) from our database. ALWAYS use this before stating any property facts; never invent details.",
    input_schema: {
      type: "object",
      properties: {
        propertyRef: {
          type: "string",
          description: "The property reference code, e.g. the one in the lead's enquiry.",
        },
      },
      required: ["propertyRef"],
    },
  },
  {
    name: "update_qualification",
    description:
      "Persist qualification details you learned from the lead. Call whenever the lead reveals budget, location, beds, timeline, buyer type, financing, or viewing interest.",
    input_schema: {
      type: "object",
      properties: {
        budget: { type: "string", description: "Budget / price range" },
        location: { type: "string", description: "Preferred location or area(s)" },
        beds: { type: "string", description: "Bedrooms / size needed" },
        timeline: { type: "string", description: "Timeline to move" },
        buyerType: {
          type: "string",
          enum: ["buyer", "investor", "renter", "unknown"],
          description: "Whether they're a buyer, investor, or renter",
        },
        financing: {
          type: "string",
          description: "Financing readiness (cash / mortgage in principle / etc.)",
        },
        viewingInterest: {
          type: "boolean",
          description: "Whether they're interested in a viewing",
        },
        notes: { type: "string", description: "Any other relevant qualification notes" },
      },
    },
  },
  {
    name: "propose_viewing",
    description:
      "Surface availability for a viewing or call. If specific slots aren't known, share the consultant's booking link.",
    input_schema: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of proposed time slots to offer.",
        },
      },
    },
  },
  {
    name: "book_viewing",
    description: "Record that the lead has accepted/booked a specific viewing or call slot.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", description: "The agreed slot, e.g. 'Thu 5pm'." },
      },
      required: ["slot"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to the human consultant. Use for complaints, legal/financial matters, price negotiation, complex situations, or any request to speak to a person. AI replies stop after this.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Brief reason for escalation." },
      },
      required: ["reason"],
    },
  },
  {
    name: "handle_optout",
    description:
      "The lead asked to stop being contacted / unsubscribe / sent STOP. Marks them opted out and halts all messaging.",
    input_schema: { type: "object", properties: {} },
  },
];

export interface ToolContext {
  lead: Lead;
  conversationId: string;
}

export interface ToolOutcome {
  /** JSON-serialisable result returned to the model. */
  result: unknown;
  /** Side effects the agent loop must apply after the model finishes. */
  effects: {
    optedOut?: boolean;
    escalated?: boolean;
    escalationReason?: string;
    viewingBooked?: boolean;
    qualificationUpdate?: Partial<Qualification>;
    statusHint?:
      | "ENGAGED"
      | "QUALIFIED"
      | "VIEWING_BOOKED"
      | "HANDED_OFF"
      | "OPTED_OUT";
  };
}

/** Execute a single tool call. Pure-ish: returns effects for the loop to apply. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolOutcome> {
  logger.info("agent.tool.call", { name, leadId: ctx.lead.id });

  switch (name) {
    case "get_property_details": {
      const ref = String(input.propertyRef ?? ctx.lead.propertyRef ?? "").trim();
      if (!ref) {
        return { result: { error: "No property reference provided." }, effects: {} };
      }
      const property = await prisma.property.findUnique({ where: { ref } });
      if (property) {
        return {
          result: {
            ref: property.ref,
            title: property.title,
            area: property.area,
            price: property.price,
            bedrooms: property.bedrooms,
            bathrooms: property.bathrooms,
            sizeSqft: property.sizeSqft,
            status: property.status,
            description: property.description,
            features: property.features,
          },
          effects: {},
        };
      }
      // Fallback to Salesforce (not yet wired to a specific object).
      const sf = await fetchPropertyFromSalesforce(ref);
      if (sf) return { result: sf, effects: {} };
      return {
        result: {
          found: false,
          note: "No authoritative details on file. Tell the lead you'll confirm with the consultant and do not guess.",
        },
        effects: {},
      };
    }

    case "update_qualification": {
      const parsed = QualificationSchema.partial().safeParse(input);
      if (!parsed.success) {
        return { result: { error: "Invalid qualification fields." }, effects: {} };
      }
      return {
        result: { ok: true, saved: parsed.data },
        effects: { qualificationUpdate: parsed.data, statusHint: "QUALIFIED" },
      };
    }

    case "propose_viewing": {
      const slots = Array.isArray(input.slots) ? (input.slots as string[]) : [];
      return {
        result: {
          ok: true,
          slots,
          calendarUrl: BUSINESS.calendarUrl || null,
          note: BUSINESS.calendarUrl
            ? "Offer the slots if given, otherwise share the calendar link."
            : "No live availability — share that the consultant will confirm a time.",
        },
        effects: { statusHint: "QUALIFIED" },
      };
    }

    case "book_viewing": {
      const slot = String(input.slot ?? "").trim();
      return {
        result: { ok: true, slot, calendarUrl: BUSINESS.calendarUrl || null },
        effects: { viewingBooked: true, statusHint: "VIEWING_BOOKED" },
      };
    }

    case "escalate_to_human": {
      const reason = String(input.reason ?? "Unspecified").trim();
      return {
        result: {
          ok: true,
          message:
            "Escalated to the consultant. Send a brief, warm message telling the lead you're connecting them with the consultant directly, then stop.",
        },
        effects: { escalated: true, escalationReason: reason, statusHint: "HANDED_OFF" },
      };
    }

    case "handle_optout": {
      return {
        result: {
          ok: true,
          message:
            "Lead opted out. Send a brief, polite confirmation that they won't be contacted again, then stop.",
        },
        effects: { optedOut: true, statusHint: "OPTED_OUT" },
      };
    }

    default:
      return { result: { error: `Unknown tool: ${name}` }, effects: {} };
  }
}

/** Combine effects from multiple tool calls in a single turn. */
export function mergeEffects(a: ToolOutcome["effects"], b: ToolOutcome["effects"]): ToolOutcome["effects"] {
  return {
    optedOut: a.optedOut || b.optedOut,
    escalated: a.escalated || b.escalated,
    escalationReason: b.escalationReason ?? a.escalationReason,
    viewingBooked: a.viewingBooked || b.viewingBooked,
    qualificationUpdate: {
      ...(a.qualificationUpdate ?? {}),
      ...(b.qualificationUpdate ?? {}),
    },
    statusHint: b.statusHint ?? a.statusHint,
  };
}

export { mergeQualification };
