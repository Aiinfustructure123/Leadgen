import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> },
) {
  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  if (!lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  return NextResponse.json({
    lead: {
      id: lead.id,
      status: lead.status,
      optedOut: lead.optedOut,
      qualification: lead.qualification,
      salesforceId: lead.salesforceId,
      viewingBooked: lead.viewingBooked,
      lastActivityAt: lead.lastActivityAt,
    },
    conversation: lead.conversations[0] ?? null,
  });
}
