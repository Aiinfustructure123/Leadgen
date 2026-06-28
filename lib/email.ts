import { Resend } from "resend";

import { BUSINESS_CONFIG } from "@/lib/config";
import { requireEnv } from "@/lib/env";

type IntroLead = {
  firstName?: string | null;
  email?: string | null;
  enquiryType?: string | null;
};

function getClient() {
  return new Resend(requireEnv("RESEND_API_KEY"));
}

export async function sendIntro(lead: IntroLead) {
  if (!lead.email) {
    return null;
  }

  const firstName = lead.firstName ?? "there";
  const enquiry = lead.enquiryType ?? "your recent enquiry";
  const consultant = BUSINESS_CONFIG.consultantName;
  const calendarUrl = BUSINESS_CONFIG.consultantCalendarUrl;

  const text = `Hi ${firstName},

Thanks for your enquiry with One Homes regarding ${enquiry}.

I'm the AI assistant for ${consultant}. I can answer questions instantly while ${consultant} is with other clients, and I can also help arrange a viewing or call.

${calendarUrl ? `If you'd like to jump straight to scheduling, here's the booking link: ${calendarUrl}\n\n` : ""}You can update your contact preferences or opt out any time by replying to this email.

Best,
${consultant}'s Assistant
One Homes`;

  const html = `
<p>Hi ${firstName},</p>
<p>Thanks for your enquiry with <strong>One Homes</strong> regarding <strong>${enquiry}</strong>.</p>
<p>I'm the AI assistant for ${consultant}. I can answer questions instantly while ${consultant} is with other clients, and I can also help arrange a viewing or call.</p>
${calendarUrl ? `<p>If you'd like to jump straight to scheduling, here's your booking link: <a href="${calendarUrl}">${calendarUrl}</a>.</p>` : ""}
<p style="color:#666;font-size:14px">You can update your contact preferences or opt out at any time by replying to this email.</p>
<p>Best,<br/>${consultant}'s Assistant<br/>One Homes</p>
`;

  return getClient().emails.send({
    from: requireEnv("EMAIL_FROM"),
    to: lead.email,
    subject: `Your One Homes enquiry: ${enquiry}`,
    html,
    text,
  });
}
