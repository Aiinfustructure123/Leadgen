import { Resend } from "resend";

import { assertEnv, env } from "@/lib/config";

type IntroLead = {
  firstName: string | null;
  email: string | null;
  enquiryType: string | null;
};

let resendClient: Resend | null = null;

function getClient() {
  if (resendClient) {
    return resendClient;
  }

  resendClient = new Resend(assertEnv("RESEND_API_KEY"));
  return resendClient;
}

export async function sendIntro(lead: IntroLead) {
  if (!lead.email) {
    return null;
  }

  const firstName = lead.firstName ?? "there";
  const enquiry = lead.enquiryType ?? "your enquiry";
  const consultant = env.CONSULTANT_NAME;
  const subject = `Thanks for your enquiry, ${firstName}`;
  const text = [
    `Hi ${firstName},`,
    "",
    `Thanks for your One Homes enquiry about ${enquiry}.`,
    `I'm ${consultant}'s AI assistant and can help immediately while ${consultant} is with clients.`,
    "",
    "Reply to this email or continue on WhatsApp and we can share details, shortlist options, and arrange a viewing.",
    "",
    `Best,`,
    `${consultant}'s Assistant`,
    "",
    "To adjust communication preferences, reply with your preference or use your original enquiry channel.",
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.5">
      <p>Hi ${firstName},</p>
      <p>
        Thank you for your One Homes enquiry about <strong>${enquiry}</strong>.
      </p>
      <p>
        I am <strong>${consultant}</strong>'s AI assistant and can help immediately while
        ${consultant} is with other clients.
      </p>
      <p>
        Reply here or continue on WhatsApp and we can share details, shortlist options,
        and arrange a viewing.
      </p>
      <p style="margin-top:24px">
        Best,<br />
        ${consultant}'s Assistant
      </p>
      <p style="font-size:12px;color:#475569;margin-top:24px">
        To adjust communication preferences, reply with your preference or use your original enquiry channel.
      </p>
    </div>
  `;

  const result = await getClient().emails.send({
    from: env.EMAIL_FROM,
    to: lead.email,
    subject,
    text,
    html,
  });

  return result.data ?? null;
}
