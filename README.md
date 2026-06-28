# One Homes AI Lead Concierge

Production-style baseline implementation of the "instant lead engagement" platform:

- Salesforce inbound webhook (`/api/webhooks/salesforce`)
- Inngest orchestration (`/api/inngest`)
- WhatsApp inbound webhook (`/api/webhooks/whatsapp`)
- Claude-powered conversational agent with tool use
- Twilio + Resend provider wrappers behind `lib/*` interfaces
- Salesforce write-back via `jsforce`
- Clerk-protected dashboard with takeover/manual send controls

## Stack

- Next.js App Router + TypeScript + Tailwind
- Prisma ORM on Postgres (Supabase-ready)
- Inngest for async orchestration/retries
- Anthropic Claude APIs (`ANTHROPIC_LIVE_MODEL`, `ANTHROPIC_CLASSIFIER_MODEL`)
- Twilio WhatsApp, Resend email, jsforce, Clerk

## Quick start

1. Install:

```bash
npm install
```

2. Copy env template:

```bash
cp .env.example .env.local
```

3. Set `DATABASE_URL` and generate Prisma client:

```bash
npm run prisma:generate
```

4. Push schema to your database:

```bash
npm run prisma:push
```

5. Start app:

```bash
npm run dev
```

## Environment variables

See `.env.example` for full list.

Critical values before go-live:

- Twilio WhatsApp credentials + approved template SIDs
- Anthropic API key
- Salesforce OAuth + webhook secret
- Clerk keys
- Inngest keys
- Consultant name + calendar URL + contact hours

## Build milestones covered

1. **Scaffold**: app, Prisma, Clerk, Inngest route and typed config.
2. **Salesforce inbound**: signature verification, dedupe, upsert lead, emit `lead/created`.
3. **Fan-out**: `onLeadCreated` sends intro template + email in parallel.
4. **WhatsApp inbound + agent loop**: stores inbound, respects opt-out, runs tool-enabled Claude reply loop.
5. **Salesforce write-back**: summary + status/qualification/flags update.
6. **Dashboard**: leads list, live polling transcript, manual takeover/status/opt-out/manual messaging.
7. **Compliance**: webhook signatures, STOP handling, contact-hours checks, 24h window guardrails.
8. **Hardening baseline**: idempotent webhook events, simple rate limiting, queue table for deferred sends.

## API routes

- `POST /api/webhooks/salesforce`
  - Verifies HMAC header `x-salesforce-signature` (hex sha256 over raw body)
  - Dedupes by `eventId`/header fallback
  - Upserts lead + emits Inngest event

- `POST /api/webhooks/whatsapp`
  - Verifies Twilio signature (`x-twilio-signature`)
  - Stores inbound lead message
  - Handles STOP/unsubscribe and sync trigger
  - Emits `message/received` to run agent loop

- `GET|POST|PUT /api/inngest`
  - Inngest serve endpoint

- Dashboard helper routes (Clerk-protected):
  - `GET /api/dashboard/leads/:leadId/conversation`
  - `POST /api/dashboard/leads/:leadId/takeover`
  - `POST /api/dashboard/leads/:leadId/status`
  - `POST /api/dashboard/leads/:leadId/optout`
  - `POST /api/dashboard/leads/:leadId/message`

## Inngest functions

- `onLeadCreated`
  - Ensures conversation
  - Sends WhatsApp template + intro email in parallel
  - Sets lead status `CONTACTED`

- `onMessageReceived`
  - Runs Claude agent loop with tools:
    - `get_property_details`
    - `update_qualification`
    - `propose_viewing`
    - `book_viewing`
    - `escalate_to_human`
    - `handle_optout`
  - Sends reply with policy checks (contact hours + 24h free-form rule)
  - Triggers Salesforce sync event

- `syncToSalesforce`
  - Summarizes transcript
  - Writes Lead custom fields and Task activity

- `staleLeadNudge` (cron)
  - Sends or queues follow-up template for stale leads

## WhatsApp template copy (for approval submission)

Starter intro template (stored in `INTRO_TEMPLATE_COPY`):

> Hi {{1}}, thanks for your enquiry with One Homes about {{2}}.  
> I'm {{3}}'s AI assistant and can help right away with details and next steps.  
> Reply STOP to opt out.

## Salesforce Flow setup notes (inbound webhook)

Create a **Record-Triggered Flow** on new Lead/Enquiry:

1. Trigger on create.
2. Build JSON body containing:
   - `eventId` (flow interview GUID or custom event key)
   - `salesforceId` (`Lead.Id` or Enquiry record id)
   - `firstName`, `lastName`, `email`, `phone`
   - `enquiryType`, `propertyRef`, `source`
   - `consentSource`
   - `salesforceUrl` (optional deep link)
3. Compute HMAC SHA-256 over raw JSON with `SF_WEBHOOK_SECRET`.
4. Send POST to `/api/webhooks/salesforce` with headers:
   - `Content-Type: application/json`
   - `x-salesforce-signature: <hex_digest>`
   - `x-salesforce-event-id: <eventId>`

## Data protection and GDPR notes

Data retained in this app:

- Lead contact/enquiry metadata
- Message transcript on WhatsApp/email
- Qualification summary and handoff metadata

Guardrails implemented:

- Explicit AI self-disclosure in first assistant response
- STOP/opt-out handling that halts automation
- Signature verification for external webhooks
- Rate limiting on public webhook endpoints
- Contact-hour aware sending with queue fallback

Operational recommendation:

- Apply DB retention policies for stale leads and transcripts based on One Homes compliance policy.
- Keep `qualification` JSON limited to buying/renting intent data; avoid unnecessary sensitive fields.

## Known configuration decisions that need your confirmation

Before production, please provide:

1. Salesforce object + exact custom field API names if different from defaults in `.env.example`
2. Dedicated WhatsApp business number and approved template SIDs
3. Final consultant-facing copy/tone preferences and contact-hours policy exceptions
4. Calendar booking flow preference (`book_viewing` direct booking vs. link-only handoff)
