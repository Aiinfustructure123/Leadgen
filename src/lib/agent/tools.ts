import { LeadStatus } from "@prisma/client";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages";
import { z } from "zod";

import { env } from "@/lib/config";
import { mergeQualification } from "@/lib/leads";
import { prisma } from "@/lib/prisma";

const getPropertySchema = z.object({
  propertyRef: z.string().min(1),
});

const updateQualificationSchema = z.object({
  budget: z.string().optional(),
  beds: z.union([z.string(), z.number()]).optional(),
  location: z.string().optional(),
  timeline: z.string().optional(),
  buyerType: z.string().optional(),
  financing: z.string().optional(),
  viewingInterest: z.string().optional(),
});

const proposeViewingSchema = z.object({
  slots: z.array(z.string()).min(1),
});

const bookViewingSchema = z.object({
  slot: z.string().min(1),
});

const escalateSchema = z.object({
  reason: z.string().min(1),
});

type AgentToolContext = {
  leadId: string;
  conversationId: string;
};

export const anthropicTools: Tool[] = [
  {
    name: "get_property_details",
    description: "Get verified property facts from the CRM or local property table by reference.",
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
    description: "Update lead qualification details discovered in conversation.",
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
    description: "Propose available viewing or call slots to the lead.",
    input_schema: {
      type: "object",
      properties: {
        slots: { type: "array", items: { type: "string" } },
      },
      required: ["slots"],
    },
  },
  {
    name: "book_viewing",
    description: "Book a confirmed viewing slot for the lead.",
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
    description: "Escalate the conversation to a human consultant and stop AI replies.",
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
    description: "Process opt-out request and halt messaging.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

export async function runAgentTool(
  toolName: string,
  rawInput: unknown,
  context: AgentToolContext,
) {
  if (toolName === "get_property_details") {
    const input = getPropertySchema.parse(rawInput);
    const property = await prisma.property.findUnique({
      where: { ref: input.propertyRef },
    });

    if (!property) {
      return {
        found: false,
        message: "Property details are not available yet. Please escalate or confirm manually.",
      };
    }

    return {
      found: true,
      property: {
        ref: property.ref,
        title: property.title,
        location: property.location,
        bedrooms: property.bedrooms,
        price: property.price?.toString(),
        description: property.description,
      },
    };
  }

  if (toolName === "update_qualification") {
    const input = updateQualificationSchema.parse(rawInput);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: context.leadId },
      select: { qualification: true },
    });

    const qualification = mergeQualification(lead.qualification, input);
    await prisma.lead.update({
      where: { id: context.leadId },
      data: {
        qualification,
        status: LeadStatus.QUALIFIED,
      },
    });

    return { success: true, qualification };
  }

  if (toolName === "propose_viewing") {
    const input = proposeViewingSchema.parse(rawInput);
    return {
      success: true,
      proposedSlots: input.slots,
      fallbackCalendarUrl: env.CONSULTANT_CALENDAR_URL || null,
    };
  }

  if (toolName === "book_viewing") {
    const input = bookViewingSchema.parse(rawInput);
    await prisma.lead.update({
      where: { id: context.leadId },
      data: {
        status: LeadStatus.VIEWING_BOOKED,
      },
    });

    await prisma.message.create({
      data: {
        conversationId: context.conversationId,
        role: "SYSTEM",
        body: `Viewing requested for slot: ${input.slot}`,
        meta: {
          slot: input.slot,
          calendarUrl: env.CONSULTANT_CALENDAR_URL || null,
        },
      },
    });

    return {
      success: true,
      slot: input.slot,
      calendarUrl: env.CONSULTANT_CALENDAR_URL || null,
    };
  }

  if (toolName === "escalate_to_human") {
    const input = escalateSchema.parse(rawInput);

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: context.conversationId },
        data: {
          handoff: true,
          handoffReason: input.reason,
          handedOffAt: new Date(),
        },
      }),
      prisma.lead.update({
        where: { id: context.leadId },
        data: { status: LeadStatus.HANDED_OFF },
      }),
      prisma.message.create({
        data: {
          conversationId: context.conversationId,
          role: "SYSTEM",
          body: `Escalated to human: ${input.reason}`,
          meta: { reason: input.reason },
        },
      }),
    ]);

    return { success: true, handoff: true, reason: input.reason };
  }

  if (toolName === "handle_optout") {
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: context.leadId },
        data: {
          optedOut: true,
          status: LeadStatus.OPTED_OUT,
        },
      }),
      prisma.conversation.update({
        where: { id: context.conversationId },
        data: {
          handoff: true,
          handoffReason: "Lead opted out",
          handedOffAt: new Date(),
        },
      }),
    ]);

    return { success: true, optedOut: true };
  }

  return { success: false, error: `Unknown tool ${toolName}` };
}
