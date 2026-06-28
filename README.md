# One Homes AI Lead Concierge

Automated AI lead engagement for One Homes property enquiries. A signed Salesforce webhook creates or dedupes a lead, Inngest fans out an approved WhatsApp template and a personalised intro email, Claude handles contextual WhatsApp qualification, and every outcome is logged back to Salesforce with a Clerk-protected consultant dashboard.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Prisma ORM on Supabase Postgres
- Inngest for durable lead/message workflows
- Anthropic Claude for the WhatsApp agent loop
- Twilio WhatsApp Business API behind `lib/whatsapp.ts`
- Resend behind `lib/email.ts`
- jsforce behind `lib/salesforce.ts`
- Clerk for dashboard auth

## Local setup

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run dev
```

Set `DATABASE_URL` to your Supabase Postgres URL before migrating:

```bash
npm run prisma:migrate
```

No secrets are committed. `.env.local` is intentionally ignored.

## Required environment

See `.env.example` for all variables. Before going live, confirm these business/provider values:

- Salesforce object and custom field API names
- Dedicated Twilio WhatsApp business number
- Approved Twilio/Meta template SIDs and final template copy
- Consultant name, email, calendar URL, and contact hours

The Claude model constants live in `lib/config.ts`:

- conversation: `claude-sonnet-4-6`
- classification placeholder: `claude-haiku-4-5-20251001`

## WhatsApp template copy

Submit this first-contact template for approval, then set `TWILIO_TEMPLATE_INTRO_SID`:

```text
Hi {{first_name}}, thanks for your enquiry about {{enquiry_type}} with One Homes. I am {{consultant_name}}'s AI assistant and can help right away while they are with clients. Reply here with any questions, or reply STOP to opt out.
```

First contact is sent only as an approved template. Free-form WhatsApp messages are only sent inside the 24-hour customer-care window after the lead has messaged.

## Salesforce inbound webhook

Create a Salesforce Flow that runs when a Lead/Enquiry is created and performs an outbound HTTP callout:

- URL: `https://<your-app>/api/webhooks/salesforce`
- Method: `POST`
- Header: `x-onehomes-signature: sha256=<hex_hmac>`
- HMAC body secret: `SF_WEBHOOK_SECRET`
- HMAC algorithm: SHA-256 over the exact raw JSON request body

Payload:

```json
{
  "salesforceId": "00Q...",
  "firstName": "Aisha",
  "lastName": "Khan",
  "email": "aisha@example.com",
  "phone": "+447700900123",
  "enquiryType": "2-bed Marylebone",
  "propertyRef": "OH-MB-2B-101",
  "source": "Website enquiry",
  "consentSource": "Website enquiry form"
}
```

The route validates the signature, dedupes by `salesforceId`, stores the lead, and emits `lead/created`.

## Salesforce write-back

`syncToSalesforce` writes:

- Lead fields configured by `SF_FIELD_AI_STATUS`, `SF_FIELD_QUALIFICATION`, `SF_FIELD_VIEWING_BOOKED`, `SF_FIELD_OPTED_OUT`, `SF_FIELD_AI_HANDLED`, and `SF_FIELD_TRANSCRIPT_URL`
- A completed Task containing status, qualification, transcript link, and recent transcript text

Property facts are never invented. `get_property_details` returns verified Salesforce data only when `SF_PROPERTY_OBJECT` and `SF_PROPERTY_REF_FIELD` are configured; otherwise the agent is instructed to say it will confirm.

## Twilio inbound webhook

Configure Twilio WhatsApp inbound messages to:

```text
POST https://<your-app>/api/webhooks/whatsapp
```

The route validates `x-twilio-signature`, dedupes by `MessageSid`, stores the inbound message, detects STOP/unsubscribe requests, and emits `message/received` for the agent.

## Dashboard

`/dashboard` is Clerk-protected and includes:

- Lead list with status, last activity, channel, and qualification snapshot
- Lead detail with transcript, Salesforce/property/source metadata, opt-out state, and contact policy context
- Takeover button that sets `handoff=true` and pauses AI replies
- Manual WhatsApp reply form that only sends inside the 24-hour care window
- Manual status and opt-out controls

The dashboard polls via `router.refresh()` every 10 seconds.

## Compliance and data flow

- All public webhooks are signature-verified and rate-limited.
- Lead `source` and `consentSource` are stored.
- AI self-disclosure is built into the WhatsApp template and Claude system prompt.
- STOP/unsubscribe sets `optedOut=true`, status `OPTED_OUT`, handoff enabled, and Salesforce sync queued.
- Free-form WhatsApp sends check the 24-hour care window.
- Contact hours are parsed from `CONTACT_HOURS`; initial fan-out and template nudges wait until the next configured opening when outside hours.
- Personal data stored: lead contact details, enquiry metadata, qualification fields, and conversation transcript needed for follow-up. Avoid adding unnecessary PII to prompts, logs, or custom fields.

## Acceptance scenario checks

Without live credentials, provider adapters skip sends and record the reason in message metadata. With credentials configured:

1. Send a signed Salesforce mock payload. Expect a Lead, WhatsApp template message record, intro email record, and status `CONTACTED`.
2. Reply via Twilio WhatsApp. Expect an inbound message, Claude response, qualification updates as learned, and Salesforce sync.
3. Ask for property facts. The agent must call `get_property_details` or say it will confirm.
4. Ask to negotiate price, complain, or speak to a person. Expect handoff and AI pause.
5. Send `STOP`. Expect opt-out, confirmation, no further messaging, and Salesforce opt-out flag.
6. Click `Take over`. Expect `handoff=true`; manual messages can be sent only inside the care window.
7. Confirm Salesforce Task and configured custom fields update after each conversation update.

## Useful commands

```bash
npm run lint
npm run typecheck
DATABASE_URL=postgresql://user:pass@localhost:5432/db npm run prisma:generate
```
