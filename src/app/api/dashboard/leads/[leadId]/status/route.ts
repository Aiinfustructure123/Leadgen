import { auth } from "@clerk/nextjs/server";
import { LeadStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

type Params = Promise<{ leadId: string }>;

const bodySchema = z.object({
  status: z.nativeEnum(LeadStatus),
});

export async function POST(request: NextRequest, context: { params: Params }) {
  await auth.protect();
  const { leadId } = await context.params;
  const json = bodySchema.safeParse(await request.json());

  if (!json.success) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const lead = await prisma.lead.update({
    where: { id: leadId },
    data: { status: json.data.status },
  });

  return NextResponse.json({ ok: true, status: lead.status });
}
