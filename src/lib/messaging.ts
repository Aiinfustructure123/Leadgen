import { OutboundType, Prisma } from "@prisma/client";

import { env } from "@/lib/config";
import { nextContactWindowStart, isWithin24hWindow, isWithinContactHours } from "@/lib/time";
import { prisma } from "@/lib/prisma";
import { sendFreeform, sendTemplate } from "@/lib/whatsapp";

type MessagingLead = {
  id: string;
  phone: string | null;
  firstName?: string | null;
  enquiryType?: string | null;
  lastInboundAt?: Date | string | null;
};

type SendTemplateInput = {
  lead: MessagingLead;
  conversationId: string;
  templateSid: string;
  vars: Record<string, string>;
  bodyForLog: string;
};

type SendFreeformInput = {
  lead: MessagingLead;
  conversationId: string;
  body: string;
  fallbackTemplateVars?: Record<string, string>;
};

async function queueMessage(args: {
  leadId: string;
  messageType: OutboundType;
  payload: Record<string, unknown>;
}) {
  return prisma.outboundQueue.create({
    data: {
      leadId: args.leadId,
      channel: "WHATSAPP",
      messageType: args.messageType,
      payload: args.payload as Prisma.InputJsonValue,
      sendAfter: nextContactWindowStart(),
    },
  });
}

export async function sendTemplateWithPolicy(input: SendTemplateInput) {
  if (!input.lead.phone) {
    return { sent: false, queued: false, reason: "Lead missing phone number" } as const;
  }

  if (!isWithinContactHours()) {
    await queueMessage({
      leadId: input.lead.id,
      messageType: "TEMPLATE",
      payload: {
        templateSid: input.templateSid,
        vars: input.vars,
      },
    });

    return { sent: false, queued: true, reason: "Outside contact hours" } as const;
  }

  const delivery = await sendTemplate(input.lead.phone, input.templateSid, input.vars);
  await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "AI",
      provider: "twilio",
      providerId: delivery.id,
      body: input.bodyForLog,
      meta: {
        templateSid: input.templateSid,
        vars: input.vars,
      },
    },
  });

  await prisma.lead.update({
    where: { id: input.lead.id },
    data: { lastOutboundAt: new Date() },
  });

  return { sent: true, queued: false } as const;
}

export async function sendFreeformWithPolicy(input: SendFreeformInput) {
  if (!input.lead.phone) {
    return { sent: false, queued: false, reason: "Lead missing phone number" } as const;
  }

  if (!isWithinContactHours()) {
    await queueMessage({
      leadId: input.lead.id,
      messageType: "FREEFORM",
      payload: {
        body: input.body,
      },
    });

    return { sent: false, queued: true, reason: "Outside contact hours" } as const;
  }

  const lastInboundAt = input.lead.lastInboundAt
    ? new Date(input.lead.lastInboundAt)
    : null;

  if (!isWithin24hWindow(lastInboundAt)) {
    if (env.TWILIO_TEMPLATE_FOLLOWUP_SID && input.fallbackTemplateVars) {
      return sendTemplateWithPolicy({
        lead: input.lead,
        conversationId: input.conversationId,
        templateSid: env.TWILIO_TEMPLATE_FOLLOWUP_SID,
        vars: input.fallbackTemplateVars,
        bodyForLog:
          "Follow-up template sent because WhatsApp free-form 24h window was closed.",
      });
    }

    await queueMessage({
      leadId: input.lead.id,
      messageType: "TEMPLATE",
      payload: {
        reason: "24h window closed",
      },
    });

    return { sent: false, queued: true, reason: "24h window closed" } as const;
  }

  const delivery = await sendFreeform(input.lead.phone, input.body);
  await prisma.message.create({
    data: {
      conversationId: input.conversationId,
      role: "AI",
      provider: "twilio",
      providerId: delivery.id,
      body: input.body,
      meta: {},
    },
  });

  await prisma.lead.update({
    where: { id: input.lead.id },
    data: { lastOutboundAt: new Date() },
  });

  return { sent: true, queued: false } as const;
}
