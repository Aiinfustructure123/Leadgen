import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { markOptedOut } from "@/lib/leads";

export async function POST(_request: Request, context: { params: Promise<{ leadId: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated." }, { status: 401 });
  }

  const { leadId } = await context.params;
  await markOptedOut(leadId);

  return NextResponse.json({ ok: true });
}
