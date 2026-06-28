import { Resend } from "resend";
import type { Lead } from "@prisma/client";

import { appConfig, env } from "@/lib/config";
import { leadFirstName } from "@/lib/lead-utils";

export type EmailSendResult = {
  providerMessageId?: string;
  skipped?: boolean;
  reason?: string;
};

export function emailIsConfigured(): boolean {
  return Boolean(env("RESEND_API_KEY"));
}

export async function sendIntro(lead: Lead): Promise<EmailSendResult> {
  if (!lead.email) {
    return { skipped: true, reason: "Lead has no email address." };
  }

  if (!emailIsConfigured()) {
    return { skipped: true, reason: "Resend API key is not configured." };
  }

  const resend = new Resend(env("RESEND_API_KEY"));
  const subject = `Your One Homes enquiry${lead.enquiryType ? `: ${lead.enquiryType}` : ""}`;
  const firstName = leadFirstName(lead);
  const enquiry = lead.enquiryType ?? "your property enquiry";

  const response = await resend.emails.send({
    from: appConfig.emailFrom,
    to: lead.email,
    subject,
    text: plainTextIntro(firstName, enquiry),
    html: htmlIntro(firstName, enquiry)
  });

  if (response.error) {
    throw new Error(response.error.message);
  }

  return { providerMessageId: response.data?.id };
}

function plainTextIntro(firstName: string, enquiry: string): string {
  return [
    `Hi ${firstName},`,
    "",
    `Thank you for your enquiry about ${enquiry} with One Homes.`,
    "",
    `I am ${appConfig.consultantName}'s AI assistant, helping make sure you get a fast response while ${appConfig.consultantName} is with clients. ${appConfig.consultantName} will also have the full context when they follow up.`,
    "",
    "If you reply with any questions, I can help qualify what you are looking for and arrange the next step.",
    appConfig.consultantCalendarUrl ? `You can also book a time here: ${appConfig.consultantCalendarUrl}` : "",
    "",
    `Warm regards,`,
    `${appConfig.consultantName}`,
    "One Homes",
    "",
    "You received this because you made a property enquiry with One Homes. Reply STOP on WhatsApp or ask us to stop contacting you at any time."
  ]
    .filter(Boolean)
    .join("\n");
}

function htmlIntro(firstName: string, enquiry: string): string {
  const booking = appConfig.consultantCalendarUrl
    ? `<p>You can also <a href="${appConfig.consultantCalendarUrl}">book a convenient time here</a>.</p>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>Thank you for your enquiry about <strong>${escapeHtml(enquiry)}</strong> with One Homes.</p>
      <p>I am ${escapeHtml(appConfig.consultantName)}'s AI assistant, helping make sure you get a fast response while ${escapeHtml(appConfig.consultantName)} is with clients. ${escapeHtml(appConfig.consultantName)} will also have the full context when they follow up.</p>
      <p>If you reply with any questions, I can help qualify what you are looking for and arrange the next step.</p>
      ${booking}
      <p>Warm regards,<br />${escapeHtml(appConfig.consultantName)}<br />One Homes</p>
      <p style="font-size: 12px; color: #697386;">You received this because you made a property enquiry with One Homes. Reply STOP on WhatsApp or ask us to stop contacting you at any time.</p>
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
