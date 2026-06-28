import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(lead);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { leadId } = await params;
  const body = await request.json();

  const allowedFields = ["status", "optedOut", "qualification"];
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updateData[field] = body[field];
    }
  }

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: updateData,
  });

  return NextResponse.json(lead);
}
