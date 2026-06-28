import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";
import { fetchPropertyFromSalesforce, salesforceConfigured } from "@/lib/salesforce";
import { sendEmail, emailConfigured } from "@/lib/email";

/** Shared mutable context passed to tool executors during an agent run. */
export interface ToolContext {
  leadId: string;
  conversationId: string;
  /** Side-effect flags surfaced back to the caller after the run. */
  effects: {
    optedOut: boolean;
    handedOff: boolean;
    viewingBooked: boolean;
    qualificationUpdated: boolean;
    escalationReason?: string;
  };
}

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "get_property_details",
    description:
      "Fetch factual details about a property (price, beds, size, area, availability) from our records. " +
      "ALWAYS use this before stating any property fact. Never invent details.",
    input_schema: {
      type: "object",
      properties: {
        propertyRef: {
          type: "string",
          description: "The property reference / listing code to look up.",
        },
      },
      required: ["propertyRef"],
    },
  },
  {
    name: "update_qualification",
    description:
      "Persist what you've learned about the lead. Call whenever you learn a new detail. " +
      "Only include fields you actually learned; omit unknown ones.",
    input_schema: {
      type: "object",
      properties: {
        budget: { type: "string", description: "Budget / price range." },
        location: { type: "string", description: "Preferred location / area." },
        beds: { type: "string", description: "Bedrooms / size requirement." },
        timeline: { type: "string", description: "Timeline to move/buy." },
        buyerType: {
          type: "string",
          enum: ["buyer", "investor", "renter", "unknown"],
          description: "Whether they are an owner-occupier buyer, investor, or renter.",
        },
        financing: {
          type: "string",
          description: "Financing readiness, e.g. cash, mortgage in principle, not yet arranged.",
        },
        viewingInterest: {
          type: "string",
          description: "Their interest in viewing, e.g. keen, maybe, not yet.",
        },
        notes: { type: "string", description: "Any other useful qualification note." },
      },
    },
  },
  {
    name: "propose_viewing",
    description:
      "Surface viewing/call availability to the lead. Returns the consultant's booking link to share.",
    input_schema: {
      type: "object",
      properties: {
        slots: {
          type: "array",
          items: { type: "string" },
          description: "Optional specific time slots you'd like to suggest.",
        },
      },
    },
  },
  {
    name: "book_viewing",
    description:
      "Record that the lead has agreed to a specific viewing/call slot. Marks the lead as VIEWING_BOOKED.",
    input_schema: {
      type: "object",
      properties: {
        slot: { type: "string", description: "The agreed date/time for the viewing or call." },
      },
      required: ["slot"],
    },
  },
  {
    name: "escalate_to_human",
    description:
      "Hand the conversation to the human consultant and STOP AI replies. Use for: price negotiation, " +
      "complaints, legal matters, complex/unusual situations, or any request to speak to a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why you are escalating." },
      },
      required: ["reason"],
    },
  },
  {
    name: "handle_optout",
    description:
      "The lead asked to stop being contacted (STOP/unsubscribe). Marks them opted out and halts all messaging.",
    input_schema: { type: "object", properties: {} },
  },
];

/** Execute a tool call and return a string result for the model. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  logger.info("agent.tool.call", { name, leadId: ctx.leadId, input });
  switch (name) {
    case "get_property_details":
      return getPropertyDetails(String(input.propertyRef ?? ""));
    case "update_qualification":
      return updateQualification(input, ctx);
    case "propose_viewing":
      return proposeViewing();
    case "book_viewing":
      return bookViewing(String(input.slot ?? ""), ctx);
    case "escalate_to_human":
      return escalateToHuman(String(input.reason ?? "unspecified"), ctx);
    case "handle_optout":
      return handleOptout(ctx);
    default:
      return `Unknown tool: ${name}`;
  }
}

async function getPropertyDetails(propertyRef: string): Promise<string> {
  if (!propertyRef) return "No property reference provided.";

  const property = await prisma.property.findUnique({ where: { propertyRef } });
  if (property) {
    const facts = {
      reference: property.propertyRef,
      title: property.title,
      area: property.area,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      sizeSqft: property.sizeSqft,
      status: property.status,
      description: property.description,
      ...(property.factsJson as Record<string, unknown> | null),
    };
    return JSON.stringify(facts);
  }

  if (salesforceConfigured()) {
    const sf = await fetchPropertyFromSalesforce(propertyRef);
    if (sf) return JSON.stringify(sf);
  }

  return JSON.stringify({
    found: false,
    message:
      "No record found for this property reference. Tell the lead you'll confirm the details with the consultant rather than guessing.",
  });
}

async function updateQualification(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const lead = await prisma.lead.findUnique({ where: { id: ctx.leadId } });
  const existing = (lead?.qualification as Record<string, unknown> | null) ?? {};
  const cleaned = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== ""),
  );
  const merged = { ...existing, ...cleaned };

  await prisma.lead.update({
    where: { id: ctx.leadId },
    data: {
      qualification: merged as Prisma.InputJsonValue,
      // Once we're learning details, the lead is at least ENGAGED.
      status:
        lead?.status === "NEW" || lead?.status === "CONTACTED" ? "ENGAGED" : lead?.status,
    },
  });
  ctx.effects.qualificationUpdated = true;
  return JSON.stringify({ ok: true, qualification: merged });
}

function proposeViewing(): string {
  const link = config.consultant.calendarUrl;
  return JSON.stringify({
    bookingLink: link || null,
    instruction: link
      ? "Share this booking link with the lead and invite them to pick a time."
      : "No live calendar configured — offer to have the consultant confirm a time and ask for the lead's availability.",
  });
}

async function bookViewing(slot: string, ctx: ToolContext): Promise<string> {
  await prisma.lead.update({
    where: { id: ctx.leadId },
    data: { status: "VIEWING_BOOKED" },
  });
  ctx.effects.viewingBooked = true;
  await notifyConsultant(`Viewing/call booked for lead ${ctx.leadId}: ${slot}`);
  return JSON.stringify({ ok: true, slot, message: "Viewing recorded. Confirm next steps with the lead." });
}

async function escalateToHuman(reason: string, ctx: ToolContext): Promise<string> {
  await prisma.conversation.update({
    where: { id: ctx.conversationId },
    data: { handoff: true },
  });
  await prisma.lead.update({
    where: { id: ctx.leadId },
    data: { status: "HANDED_OFF" },
  });
  ctx.effects.handedOff = true;
  ctx.effects.escalationReason = reason;
  await notifyConsultant(`Lead ${ctx.leadId} escalated to human. Reason: ${reason}`);
  return JSON.stringify({
    ok: true,
    message:
      "Conversation handed to the consultant. Send a brief, warm message letting the lead know a human will follow up shortly, then stop.",
  });
}

async function handleOptout(ctx: ToolContext): Promise<string> {
  await prisma.lead.update({
    where: { id: ctx.leadId },
    data: { optedOut: true, status: "OPTED_OUT" },
  });
  ctx.effects.optedOut = true;
  return JSON.stringify({
    ok: true,
    message:
      "Lead opted out. Send ONE short, polite confirmation that they won't be contacted again, then stop.",
  });
}

/** Notify the human consultant of an escalation/booking. Best-effort. */
async function notifyConsultant(message: string): Promise<void> {
  logger.warn("agent.notify.consultant", { message });
  const to = process.env.CONSULTANT_NOTIFY_EMAIL;
  if (to && emailConfigured()) {
    try {
      await sendEmail({
        to,
        subject: "One Homes AI Concierge — action needed",
        html: `<p>${message}</p><p><a href="${config.appUrl}/dashboard">Open dashboard</a></p>`,
        text: `${message}\n\nOpen dashboard: ${config.appUrl}/dashboard`,
      });
    } catch (err) {
      logger.error("agent.notify.consultant.failed", { err });
    }
  }
}
