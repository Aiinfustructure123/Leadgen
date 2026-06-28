# One Homes AI Lead Concierge

Production-oriented scaffold for an automated lead-engagement system:

- Salesforce webhook ingestion with signature verification + idempotency
- Inngest event orchestration
- WhatsApp send/receive pipeline (Twilio)
- Personalised intro email (Resend)
- Claude-based conversational agent with tool use
- Salesforce write-back (jsforce)
- Clerk-protected consultant dashboard with manual takeover

## Stack

- Next.js App Router + TypeScript + Tailwind
- Prisma ORM on Postgres (Supabase-compatible)
- Inngest
- Anthropic Claude
- Twilio WhatsApp
- Resend
- Salesforce (`jsforce`)
- Clerk auth

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy envs and fill real values:

   ```bash
   cp .env.example .env.local
   ```

3. Generate Prisma client + migrations:

   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. Run app:

   ```bash
   npm run dev
   ```

5. Inngest local dev (optional, separate terminal):

   ```bash
   npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
   ```

## Environment variables

See `.env.example` for all keys.

Important keys:

- `ANTHROPIC_API_KEY`
- `TWILIO_*`
- `RESEND_API_KEY`, `EMAIL_FROM`
- `SF_*` credentials + `SF_WEBHOOK_SECRET`
- `DATABASE_URL`
- `CLERK_*`
- `CONSULTANT_NAME`, `CONSULTANT_CALENDAR_URL`, `CONTACT_HOURS`

## Architecture

```text
Salesforce (new enquiry)
  -> POST /api/webhooks/salesforce
      -> verify HMAC + dedupe (WebhookEvent)
      -> upsert Lead + Conversation
      -> emit lead/created
          -> onLeadCreated:
               send WhatsApp template + intro email
               update status CONTACTED
               emit lead/sync.requested

Twilio inbound WhatsApp
  -> POST /api/webhooks/whatsapp
      -> verify Twilio signature + dedupe
      -> store LEAD message
      -> STOP detection -> opt out + sync
      -> emit message/received
          -> onMessageReceived:
               classify inbound (Haiku)
               run agent loop (Sonnet + tool use)
               send freeform within 24h window
               fallback to template when window closed
               emit lead/sync.requested

lead/sync.requested
  -> syncToSalesforce:
       update Lead fields + create Task transcript summary
```

## API endpoints

- `POST /api/webhooks/salesforce`
- `POST /api/webhooks/whatsapp`
- `GET|POST /api/inngest`
- `GET /api/leads/:leadId/conversation` (dashboard polling)

## Dashboard

- `/dashboard`: lead list with status + latest activity
- `/dashboard/leads/:leadId`: transcript, qualification snapshot, manual actions:
  - Take over (handoff)
  - Manual status override
  - Manual opt-out
  - Send human message
  - Add consultant notes (pin important context)
  - Create and track follow-ups with due date + priority + completion status

## Claude tools implemented

- `get_property_details(propertyRef)`
- `update_qualification(fields)`
- `propose_viewing(slots)`
- `book_viewing(slot)`
- `escalate_to_human(reason)`
- `handle_optout()`

## Compliance implemented

- AI self-disclosure enforced on first AI response
- STOP / unsubscribe handling with full opt-out update path
- 24-hour WhatsApp customer-care window guard
- Contact-hours guard (messages delay to next allowed contact time)
- Signature verification on both Salesforce + Twilio webhooks
- Basic webhook rate-limiting
- Idempotent inbound processing with `WebhookEvent(source, externalId)` unique key

## Salesforce Flow setup notes (inbound)

Create a record-triggered Flow on new Lead/Enquiry and send an outbound HTTP POST to:

`POST https://<your-domain>/api/webhooks/salesforce`

Payload fields expected:

- `eventId` (unique event id from Flow/interview)
- `salesforceId`
- `firstName`
- `lastName`
- `email`
- `phone`
- `enquiryType`
- `propertyRef`
- `source`
- `consentSource`

Signature:

1. Generate `HMAC_SHA256(raw_json_body, SF_WEBHOOK_SECRET)`
2. Send in header `x-salesforce-signature` (or override via `SF_WEBHOOK_SIGNATURE_HEADER`)

## WhatsApp intro template copy (starter)

Use this as the seed copy for Twilio/Meta approval:

> Hi {{1}}, thanks for your enquiry with One Homes about {{2}}.  
> I'm {{3}}, the AI assistant for {{4}}. I can help right away while they are with other clients.  
> Reply STOP to opt out.

## Data minimisation and GDPR notes

Data stored:

- Lead identity + enquiry context
- Conversation transcript for servicing the enquiry
- Qualification facts needed to progress the enquiry
- Messaging metadata (provider IDs, template IDs, status events)

Retention/deletion policy should be set in CRM policy and mirrored here.
Avoid storing sensitive categories not required for qualifying and scheduling.

## Open configuration decisions before go-live

Please provide these before production:

1. Final Salesforce object + custom field API names
2. Dedicated Twilio WhatsApp sender number
3. Approved template SID(s)
4. Calendar booking policy (direct booking vs approval queue)
