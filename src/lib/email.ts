import { Resend } from "resend";
import { BUSINESS, requireEnv } from "./config";
import { logger } from "./logger";
import type { Lead } from "@prisma/client";

/**
 * Email provider interface. Business logic uses `email.sendIntro(lead)`; the
 * Resend implementation is swappable for SendGrid/SES later.
 */
export interface EmailSendResult {
  id: string;
  provider: "resend";
}

export interface EmailProvider {
  sendIntro(lead: Lead): Promise<EmailSendResult>;
}

let cachedResend: Resend | null = null;
function resend() {
  if (!cachedResend) cachedResend = new Resend(requireEnv("RESEND_API_KEY"));
  return cachedResend;
}

function leadFirstName(lead: Lead): string {
  return lead.firstName?.trim() || "there";
}

function enquiryLine(lead: Lead): string {
  if (lead.enquiryType && lead.propertyRef) {
    return `your enquiry about <strong>${escapeHtml(lead.enquiryType)}</strong> (ref ${escapeHtml(
      lead.propertyRef
    )})`;
  }
  if (lead.enquiryType) return `your enquiry about <strong>${escapeHtml(lead.enquiryType)}</strong>`;
  return "your recent enquiry";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Build the premium HTML + plain-text intro email. Config-driven copy. */
export function buildIntroEmail(lead: Lead): {
  subject: string;
  html: string;
  text: string;
} {
  const name = leadFirstName(lead);
  const consultant = BUSINESS.consultantName;
  const company = BUSINESS.companyName;
  const enquiry = enquiryLine(lead);
  const enquiryText = lead.enquiryType
    ? `your enquiry about ${lead.enquiryType}${lead.propertyRef ? ` (ref ${lead.propertyRef})` : ""}`
    : "your recent enquiry";
  const calendar = BUSINESS.calendarUrl;
  const prefsUrl = `${BUSINESS.appUrl}/preferences?lead=${lead.id}`;

  const subject = `${company} — about ${lead.enquiryType ?? "your enquiry"}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.06);">
          <tr><td style="background:#0f3d3e;padding:22px 32px;">
            <span style="color:#c9a86a;font-size:18px;font-weight:600;letter-spacing:0.5px;">${escapeHtml(company)}</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <p style="margin:0 0 16px;font-size:16px;">Hi ${escapeHtml(name)},</p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
              Thank you for ${enquiry}. I'm ${escapeHtml(consultant)}, your senior property
              consultant at ${escapeHtml(company)} — I wanted to reach out personally to say I'd
              love to help you find the right home.
            </p>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
              I've also sent you a quick message on WhatsApp so we can chat whenever suits you. My
              AI assistant can answer your questions right away while I'm with other clients, and
              I'll personally step in for viewings and the details that matter.
            </p>
            ${
              calendar
                ? `<p style="margin:24px 0;text-align:center;">
                     <a href="${escapeHtml(calendar)}" style="background:#0f3d3e;color:#ffffff;text-decoration:none;padding:12px 26px;border-radius:8px;font-size:15px;display:inline-block;">Book a call or viewing</a>
                   </p>`
                : ""
            }
            <p style="margin:0 0 4px;font-size:15px;line-height:1.6;">Warm regards,</p>
            <p style="margin:0;font-size:15px;font-weight:600;">${escapeHtml(consultant)}</p>
            <p style="margin:0;font-size:13px;color:#6b6b6b;">${escapeHtml(company)}</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#faf9f6;border-top:1px solid #eceae4;">
            <p style="margin:0;font-size:12px;color:#9a9a9a;line-height:1.5;">
              You're receiving this because you enquired with ${escapeHtml(company)}.
              Manage your preferences or unsubscribe <a href="${escapeHtml(prefsUrl)}" style="color:#6b6b6b;">here</a>.
              This message was assisted by AI on behalf of ${escapeHtml(consultant)}.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${name},

Thank you for ${enquiryText}. I'm ${consultant}, your senior property consultant at ${company} — I wanted to reach out personally to say I'd love to help you find the right home.

I've also sent you a quick message on WhatsApp so we can chat whenever suits you. My AI assistant can answer your questions right away while I'm with other clients, and I'll personally step in for viewings and the details that matter.
${calendar ? `\nBook a call or viewing: ${calendar}\n` : ""}
Warm regards,
${consultant}
${company}

—
You're receiving this because you enquired with ${company}. Manage preferences or unsubscribe: ${prefsUrl}
This message was assisted by AI on behalf of ${consultant}.`;

  return { subject, html, text };
}

class ResendEmailProvider implements EmailProvider {
  async sendIntro(lead: Lead): Promise<EmailSendResult> {
    if (!lead.email) throw new Error("Lead has no email address");
    const { subject, html, text } = buildIntroEmail(lead);
    const { data, error } = await resend().emails.send({
      from: BUSINESS.emailFrom,
      to: lead.email,
      subject,
      html,
      text,
    });
    if (error) {
      logger.error("email.intro.error", { leadId: lead.id, error: String(error) });
      throw new Error(`Resend error: ${error.message}`);
    }
    logger.info("email.intro.sent", { leadId: lead.id, id: data?.id });
    return { id: data?.id ?? "", provider: "resend" };
  }
}

export const email: EmailProvider = new ResendEmailProvider();
