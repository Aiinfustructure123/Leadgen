import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";

const statusSchema = z.object({
  status: z.enum([
    "NEW",
    "CONTACTED",
    "ENGAGED",
    "QUALIFIED",
    "VIEWING_BOOKED",
    "HANDED_OFF",
    "OPTED_OUT",
    "DEAD",
  ]),
});

export async function POST(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const parsed = statusSchema.safeParse(await _request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { leadId } = await context.params;
  await prisma.lead.update({
    where: { id: leadId },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
