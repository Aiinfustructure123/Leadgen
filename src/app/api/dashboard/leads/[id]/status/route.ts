import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { inngest } from "@/lib/inngest/client";
import { LeadStatus } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const VALID_STATUSES = Object.values(LeadStatus) as string[];

/** Manual status override and/or manual opt-out from the dashboard. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    optedOut?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (body.status) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 422 });
    }
    data.status = body.status;
  }
  if (typeof body.optedOut === "boolean") {
    data.optedOut = body.optedOut;
    if (body.optedOut) data.status = "OPTED_OUT";
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const lead = await prisma.lead.update({ where: { id }, data });
  await inngest.send({ name: "lead/sync-requested", data: { leadId: id } });

  logger.info("dashboard.status-update", { leadId: id, data });
  return NextResponse.json({ ok: true, lead });
}
