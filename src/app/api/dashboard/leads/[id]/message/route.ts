import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getOrCreateConversation } from "@/lib/leads";
import {
  sendFreeform,
  isWithinWindow,
  whatsappConfigured,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/** Send a manual message from the consultant into the WhatsApp thread. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { body?: string };
  const text = body.body?.trim();
  if (!text) return NextResponse.json({ error: "empty_message" }, { status: 400 });

  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (lead.optedOut) {
    return NextResponse.json({ error: "lead_opted_out" }, { status: 409 });
  }
  if (!lead.phone) {
    return NextResponse.json({ error: "no_phone" }, { status: 409 });
  }

  const conversation = await getOrCreateConversation(id, "WHATSAPP");

  let providerId: string | null = null;
  let delivery: "sent" | "window-closed" | "not-configured" = "not-configured";

  if (whatsappConfigured()) {
    if (isWithinWindow(lead.lastInboundAt)) {
      const res = await sendFreeform(lead.phone, text);
      providerId = res.providerId;
      delivery = "sent";
    } else {
      delivery = "window-closed";
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "HUMAN",
      body: text,
      providerId,
      meta: { delivery, sentBy: "consultant" },
    },
  });

  logger.info("dashboard.human-message", { leadId: id, delivery });
  return NextResponse.json({ ok: true, delivery, message });
}
