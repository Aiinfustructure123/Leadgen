import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      conversations: {
        orderBy: { createdAt: "asc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const messages = lead.conversations.flatMap((c) =>
    c.messages.map((m) => ({
      id: m.id,
      role: m.role,
      body: m.body,
      channel: c.channel,
      createdAt: m.createdAt,
    })),
  );
  messages.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));

  return NextResponse.json({
    status: lead.status,
    handoff: lead.conversations.some((c) => c.handoff),
    optedOut: lead.optedOut,
    messages,
  });
}
