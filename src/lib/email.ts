/**
 * Email provider abstraction — all Resend calls are isolated here.
 * To swap to SendGrid or SES, change only this file.
 */

import { Resend } from "resend";
import { CONSULTANT_NAME, CONSULTANT_CALENDAR_URL, EMAIL_FROM } from "./config";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

export interface Lead {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  enquiryType?: string | null;
  propertyRef?: string | null;
}

/**
 * Send the personalised intro email to a new lead.
 */
export async function sendIntro(lead: Lead): Promise<string | null> {
  if (!lead.email) return null;

  const firstName = lead.firstName ?? "there";
  const enquiry = lead.enquiryType ?? "your recent property enquiry";
  const propertyRef = lead.propertyRef ? ` (ref: ${lead.propertyRef})` : "";

  const html = buildIntroHtml({
    firstName,
    enquiry,
    propertyRef,
    consultantName: CONSULTANT_NAME,
    calendarUrl: CONSULTANT_CALENDAR_URL,
  });

  const text = buildIntroText({
    firstName,
    enquiry,
    propertyRef,
    consultantName: CONSULTANT_NAME,
    calendarUrl: CONSULTANT_CALENDAR_URL,
  });

  const result = await getResend().emails.send({
    from: EMAIL_FROM,
    to: lead.email,
    subject: `Your enquiry about ${enquiry}${propertyRef} — One Homes`,
    html,
    text,
  });

  return result.data?.id ?? null;
}

interface EmailVars {
  firstName: string;
  enquiry: string;
  propertyRef: string;
  consultantName: string;
  calendarUrl: string;
}

function buildIntroHtml(v: EmailVars): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>One Homes — Your Enquiry</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9f9f7; margin: 0; padding: 0; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
    .header { background: #1a1a1a; padding: 32px 40px; }
    .header h1 { color: #fff; font-size: 22px; margin: 0; font-weight: 600; letter-spacing: -0.3px; }
    .body { padding: 36px 40px; color: #333; line-height: 1.7; font-size: 15px; }
    .body h2 { font-size: 18px; color: #1a1a1a; margin-top: 0; }
    .cta { display: inline-block; margin-top: 24px; padding: 12px 28px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500; }
    .footer { padding: 24px 40px; background: #f9f9f7; color: #999; font-size: 12px; line-height: 1.6; border-top: 1px solid #eee; }
    .footer a { color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>One Homes</h1>
    </div>
    <div class="body">
      <h2>Hi ${v.firstName},</h2>
      <p>
        Thank you for your enquiry about <strong>${v.enquiry}${v.propertyRef}</strong>.
        I'm ${v.consultantName}, a senior property consultant at One Homes, and I wanted
        to personally reach out to make sure you have everything you need.
      </p>
      <p>
        I've also sent you a WhatsApp message so we can chat quickly and easily — my AI
        assistant is available right now to answer any questions while I'm with other clients.
        It can give you details about the property, discuss your requirements, and help schedule
        a viewing at a time that works for you.
      </p>
      <p>
        If you'd prefer to jump straight to booking a call or viewing, you can do so here:
      </p>
      ${v.calendarUrl ? `<a href="${v.calendarUrl}" class="cta">Book a call or viewing →</a>` : ""}
      <p style="margin-top:28px;">
        I look forward to helping you find your perfect home.
      </p>
      <p>
        Warm regards,<br />
        <strong>${v.consultantName}</strong><br />
        <em>Senior Property Consultant, One Homes</em>
      </p>
    </div>
    <div class="footer">
      <p>
        You're receiving this email because you submitted an enquiry through One Homes.
        If you'd like to update your contact preferences or unsubscribe from further
        communications, please reply to this email with "Unsubscribe" or click
        <a href="mailto:hello@onehomes.example?subject=Unsubscribe&body=Please%20remove%20me%20from%20your%20list">here</a>.
      </p>
      <p>One Homes · 123 Mayfair Lane, London W1K 1AA · United Kingdom</p>
    </div>
  </div>
</body>
</html>`;
}

function buildIntroText(v: EmailVars): string {
  return `Hi ${v.firstName},

Thank you for your enquiry about ${v.enquiry}${v.propertyRef}.

I'm ${v.consultantName}, a senior property consultant at One Homes, and I wanted to personally reach out to make sure you have everything you need.

I've also sent you a WhatsApp message so we can chat quickly and easily — my AI assistant is available right now to answer any questions while I'm with other clients. It can give you details about the property, discuss your requirements, and help schedule a viewing at a time that works for you.

${v.calendarUrl ? `If you'd prefer to jump straight to booking: ${v.calendarUrl}` : ""}

I look forward to helping you find your perfect home.

Warm regards,
${v.consultantName}
Senior Property Consultant, One Homes

---
You're receiving this email because you submitted an enquiry through One Homes.
To unsubscribe, reply with "Unsubscribe".

One Homes · 123 Mayfair Lane, London W1K 1AA · United Kingdom`;
}
