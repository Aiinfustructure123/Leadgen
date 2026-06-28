import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { ensureConversation } from "@/lib/leads";
import { prisma } from "@/lib/prisma";
import { isWithin24hWindow, isWithinContactHours, nextContactWindowStart } from "@/lib/time";
import { sendFreeform } from "@/lib/whatsapp";

type Params = Promise<{ leadId: string }>;

const bodySchema = z.object({
  body: z.string().min(1),
});

export async function POST(request: NextRequest, context: { params: Params }) {
  const user = await auth.protect();
  const { leadId } = await context.params;
  const json = bodySchema.safeParse(await request.json());

  if (!json.success) {
    return NextResponse.json({ error: "Invalid message body" }, { status: 400 });
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || !lead.phone) {
    return NextResponse.json({ error: "Lead phone missing" }, { status: 400 });
  }

  const conversation = await ensureConversation(leadId);
  const withinHours = isWithinContactHours();
  const within24h = isWithin24hWindow(lead.lastInboundAt);

  if (!withinHours || !within24h) {
    await prisma.outboundQueue.create({
      data: {
        leadId,
        channel: "WHATSAPP",
        messageType: "FREEFORM",
        sendAfter: nextContactWindowStart(),
        payload: {
          body: json.data.body,
          role: "HUMAN",
          createdBy: user.userId,
          reason: !withinHours ? "outside-contact-hours" : "24h-window-closed",
        },
      },
    });

    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "SYSTEM",
        body: `Manual message queued (${!withinHours ? "outside contact hours" : "24h window closed"}).`,
      },
    });

    return NextResponse.json({ ok: true, queued: true });
  }

  const delivery = await sendFreeform(lead.phone, json.data.body);
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "HUMAN",
      body: json.data.body,
      provider: "twilio",
      providerId: delivery.id,
      meta: {
        createdBy: user.userId,
      },
    },
  });

  return NextResponse.json({ ok: true, queued: false });
}
