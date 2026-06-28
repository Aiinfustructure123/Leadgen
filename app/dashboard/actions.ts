"use server";

import { LeadStatus, Role } from "@prisma/client";
import { revalidatePath } from "next/cache";

import { BUSINESS_CONFIG } from "@/lib/config";
import { isWithinCustomerCareWindow } from "@/lib/contact-policy";
import { appendMessage } from "@/lib/lead-service";
import { prisma } from "@/lib/prisma";
import { sendFreeform, sendTemplate } from "@/lib/whatsapp";

export async function takeOverConversation(formData: FormData) {
  const conversationId = String(formData.get("conversationId"));
  if (!conversationId) {
    return;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      handoff: true,
      handoffReason: "Manual takeover from dashboard",
    },
  });

  revalidatePath("/dashboard");
}

export async function updateLeadStatus(formData: FormData) {
  const leadId = String(formData.get("leadId"));
  const status = String(formData.get("status")) as LeadStatus;
  if (!leadId || !status) {
    return;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status,
      lastActivityAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard");
}

export async function optOutLead(formData: FormData) {
  const leadId = String(formData.get("leadId"));
  if (!leadId) {
    return;
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      optedOut: true,
      status: LeadStatus.OPTED_OUT,
      lastActivityAt: new Date(),
    },
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard");
}

export async function sendHumanMessage(formData: FormData) {
  const leadId = String(formData.get("leadId"));
  const conversationId = String(formData.get("conversationId"));
  const message = String(formData.get("message") ?? "").trim();

  if (!leadId || !conversationId || !message) {
    return;
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead?.phone || lead.optedOut) {
    return;
  }

  if (isWithinCustomerCareWindow(lead.lastInboundAt)) {
    const sent = await sendFreeform(lead.phone, message);
    await appendMessage({
      conversationId,
      role: Role.HUMAN,
      body: message,
      providerMessageId: sent.sid,
      meta: { sentBy: "consultant-dashboard", type: "freeform" },
    });
  } else {
    const sent = await sendTemplate(lead.phone, BUSINESS_CONFIG.introTemplateSid, {
      "1": lead.firstName ?? "there",
      "2": lead.enquiryType ?? "your enquiry",
      "3": "One Homes",
      "4": BUSINESS_CONFIG.consultantName,
    });
    await appendMessage({
      conversationId,
      role: Role.SYSTEM,
      body: "24h window closed; human message replaced with approved template send.",
      providerMessageId: sent.sid,
      meta: { sentBy: "consultant-dashboard", type: "template-fallback" },
    });
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { status: LeadStatus.HANDED_OFF, lastActivityAt: new Date() },
  });

  revalidatePath(`/dashboard/leads/${leadId}`);
  revalidatePath("/dashboard");
}
