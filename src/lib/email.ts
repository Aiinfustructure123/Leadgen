/**
 * Email provider interface (Resend). All callers use `sendIntro` / `sendEmail`
 * so we can swap to SendGrid/SES later without touching business logic.
 */
import { Resend } from "resend";
import { hasEnv, requireEnv } from "@/lib/env";
import { config } from "@/lib/config";
import { logger } from "@/lib/logger";

let resendClient: Resend | null = null;

function client(): Resend {
  if (!resendClient) {
    resendClient = new Resend(requireEnv("RESEND_API_KEY"));
  }
  return resendClient;
}

export function emailConfigured(): boolean {
  return hasEnv("RESEND_API_KEY", "EMAIL_FROM");
}

export interface LeadLike {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  enquiryType?: string | null;
  propertyRef?: string | null;
}

export interface SendEmailResult {
  providerId: string;
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendEmailResult> {
  const { data, error } = await client().emails.send({
    from: config.email.from,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  if (error) {
    logger.error("email.send.error", { error, to: opts.to });
    throw new Error(`Resend error: ${error.message}`);
  }
  logger.info("email.sent", { to: opts.to, id: data?.id });
  return { providerId: data?.id ?? "" };
}

/**
 * Send a personalised, on-brand intro email referencing the lead's enquiry.
 * Premium and short, signed by the consultant with the AI assistant noted.
 */
export async function sendIntro(lead: LeadLike): Promise<SendEmailResult> {
  if (!lead.email) {
    throw new Error("Cannot send intro email: lead has no email address");
  }
  const name = lead.firstName?.trim() || "there";
  const enquiry = lead.enquiryType?.trim();
  const consultant = config.consultant.name;
  const company = config.consultant.company;

  const enquiryLine = enquiry
    ? `Thank you for your enquiry about <strong>${escapeHtml(enquiry)}</strong>.`
    : "Thank you for getting in touch with us.";
  const enquiryLineText = enquiry
    ? `Thank you for your enquiry about ${enquiry}.`
    : "Thank you for getting in touch with us.";

  const subject = enquiry
    ? `Your enquiry about ${enquiry} — ${company}`
    : `Thanks for your enquiry — ${company}`;

  const html = introHtml({ name, enquiryLine, consultant, company });
  const text = introText({ name, enquiryLineText, consultant, company });

  return sendEmail({ to: lead.email, subject, html, text });
}

function introHtml(p: {
  name: string;
  enquiryLine: string;
  consultant: string;
  company: string;
}): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f6f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #ececec;">
        <h1 style="font-size:20px;margin:0 0 16px;font-weight:600;">Hi ${escapeHtml(p.name)},</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">${p.enquiryLine}</p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 14px;">
          I'm ${escapeHtml(p.consultant)}, a senior property consultant at ${escapeHtml(
            p.company,
          )}. I'd love to help you find the right home. I've also sent you a quick
          message on WhatsApp so we can chat whenever suits you — my AI assistant
          can answer questions straight away while I'm with other clients.
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0 0 24px;">
          Feel free to reply here or on WhatsApp with anything you'd like to know.
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0;">Warm regards,<br/>
          <strong>${escapeHtml(p.consultant)}</strong><br/>
          <span style="color:#777;">${escapeHtml(p.company)}</span>
        </p>
      </div>
      <p style="font-size:12px;color:#999;text-align:center;margin:20px 0 0;line-height:1.5;">
        You're receiving this because you made an enquiry with ${escapeHtml(p.company)}.
        Reply with "unsubscribe" to stop hearing from us.
      </p>
    </div>
  </body>
</html>`;
}

function introText(p: {
  name: string;
  enquiryLineText: string;
  consultant: string;
  company: string;
}): string {
  return `Hi ${p.name},

${p.enquiryLineText}

I'm ${p.consultant}, a senior property consultant at ${p.company}. I'd love to help you find the right home. I've also sent you a quick message on WhatsApp so we can chat whenever suits you — my AI assistant can answer questions straight away while I'm with other clients.

Feel free to reply here or on WhatsApp with anything you'd like to know.

Warm regards,
${p.consultant}
${p.company}

---
You're receiving this because you made an enquiry with ${p.company}. Reply with "unsubscribe" to stop hearing from us.`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
