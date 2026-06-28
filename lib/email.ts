import { Resend } from "resend";

import { getConsultantName, getEmailFrom, getEnv } from "@/lib/config";
import type { Lead } from "@/generated/prisma/client";

export async function sendIntro(lead: Lead) {
  if (!lead.email) {
    return { skipped: true as const, reason: "Lead has no email address." };
  }

  const consultantName = getConsultantName();
  const subject = buildSubject(lead);
  const text = buildTextIntro(lead, consultantName);
  const html = buildHtmlIntro(lead, consultantName);
  const resend = new Resend(getEnv("RESEND_API_KEY"));

  const result = await resend.emails.send({
    from: getEmailFrom(),
    to: lead.email,
    subject,
    html,
    text,
  });

  return { skipped: false as const, providerMessageId: result.data?.id };
}

function buildSubject(lead: Lead): string {
  return lead.enquiryType
    ? `Your One Homes enquiry: ${lead.enquiryType}`
    : "Your One Homes enquiry";
}

function buildTextIntro(lead: Lead, consultantName: string): string {
  const greeting = lead.firstName ? `Hi ${lead.firstName},` : "Hi,";
  const enquiry = lead.enquiryType
    ? ` about ${lead.enquiryType}`
    : lead.propertyRef
      ? ` about property ${lead.propertyRef}`
      : "";

  return `${greeting}

Thank you for your enquiry${enquiry}. ${consultantName} has received it and will be happy to help.

I am ${consultantName}'s AI assistant, here to answer quick questions and help arrange a viewing or call while ${consultantName} is with clients.

If WhatsApp is easier, you can reply there too. You can unsubscribe or update preferences by replying STOP on WhatsApp or by telling us by email.

Warm regards,
${consultantName}
One Homes`;
}

function buildHtmlIntro(lead: Lead, consultantName: string): string {
  const greeting = lead.firstName ? `Hi ${escapeHtml(lead.firstName)},` : "Hi,";
  const enquiry = lead.enquiryType
    ? ` about <strong>${escapeHtml(lead.enquiryType)}</strong>`
    : lead.propertyRef
      ? ` about property <strong>${escapeHtml(lead.propertyRef)}</strong>`
      : "";

  return `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;max-width:640px">
      <p>${greeting}</p>
      <p>Thank you for your enquiry${enquiry}. ${escapeHtml(
        consultantName,
      )} has received it and will be happy to help.</p>
      <p>I am ${escapeHtml(
        consultantName,
      )}'s AI assistant, here to answer quick questions and help arrange a viewing or call while ${escapeHtml(
        consultantName,
      )} is with clients.</p>
      <p>If WhatsApp is easier, you can reply there too.</p>
      <p style="margin-top:28px">Warm regards,<br />${escapeHtml(
        consultantName,
      )}<br />One Homes</p>
      <p style="font-size:12px;color:#5f6b7a">You can unsubscribe or update preferences by replying STOP on WhatsApp or by telling us by email.</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
