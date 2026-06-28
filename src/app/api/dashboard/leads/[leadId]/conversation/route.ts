import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type Params = Promise<{ leadId: string }>;

export async function GET(_request: NextRequest, context: { params: Params }) {
  await auth.protect();
  const { leadId } = await context.params;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 200,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const conversation = lead.conversations[0];
  return NextResponse.json({
    lead: {
      id: lead.id,
      name: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      qualification: lead.qualification,
      optedOut: lead.optedOut,
      manualOverride: lead.manualOverride,
      salesforceUrl: lead.salesforceUrl,
    },
    conversation: conversation
      ? {
          id: conversation.id,
          handoff: conversation.handoff,
          handoffReason: conversation.handoffReason,
          messages: conversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            body: message.body,
            createdAt: message.createdAt,
          })),
        }
      : null,
  });
}
