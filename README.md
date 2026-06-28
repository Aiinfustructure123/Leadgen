# One Homes — AI Lead Concierge

An automated AI lead-engagement system for a senior property consultant. The
moment a new enquiry lands in Salesforce, it:

1. Sends the lead a **WhatsApp** message within seconds (business-initiated, via an approved template).
2. Sends a **personalised intro email** at the same time.
3. Holds a **real, contextual qualifying conversation** on WhatsApp powered by Claude when the lead replies.
4. Logs the full conversation, qualification data, and outcome **back into Salesforce**.
5. Provides a **dashboard** for the consultant to watch live conversations and take over manually.

> Goal: every lead gets an instant, warm, intelligent first touch, so none go cold while the consultant is busy.

---

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript + Tailwind CSS |
| Database | Supabase (Postgres) via Prisma ORM |
| AI engine | Anthropic Claude (`claude-sonnet-4-6` for chat, `claude-haiku-4-5` for classification/summaries) |
| WhatsApp | Twilio WhatsApp Business API (behind `lib/whatsapp.ts`) |
| Email | Resend (behind `lib/email.ts`) |
| Orchestration | Inngest (fan-out, retries, idempotent event handling) |
| Salesforce | `jsforce` |
| Dashboard auth | Clerk |
| Hosting | Vercel |

All provider calls sit behind `src/lib/*` interfaces so vendors are swappable.
All business copy / persona / policy is config-driven in `src/lib/config.ts`
(env-backed).

---

## Architecture & flow

```
Salesforce (new Enquiry)
      │  Flow → Outbound webhook (HMAC-signed)
      ▼
POST /api/webhooks/salesforce  ──►  verify + dedupe + upsert Lead  ──►  Inngest "lead/created"
                                                                              │
                          ┌───────────────────────────────────────────────────┤
                          ▼                                                     ▼
         send WhatsApp TEMPLATE (intro+opt-in)                    send personalised intro EMAIL
                          │
        Lead replies on WhatsApp
                          ▼
POST /api/webhooks/whatsapp  ──►  verify signature + store msg + STOP check  ──►  Inngest "message/received"
                          ▼
        Agent loop (Claude + tools): history → model →
        {reply | get_property_details | propose/book_viewing |
         update_qualification | escalate_to_human | handle_optout} → send reply
                          ▼
        Inngest "lead/sync-requested" → transcript summary + qualification → Salesforce
```

### The 24-hour WhatsApp rule (enforced everywhere)

Outside the 24h customer-care window you may ONLY send **pre-approved templates**.
Inside the window (after the lead messages) you may send **free-form AI replies**.
`isWithinWindow(lastInboundAt)` gates every free-form send; outside it, the code
falls back to a template or skips. See `src/lib/whatsapp.ts`.

---

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in values
```

### 2. Database

Point `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) at your Supabase Postgres.

```bash
npm run prisma:generate
npm run prisma:migrate       # creates tables (uses DIRECT_URL)
npm run db:seed              # optional: seeds a sample property
```

### 3. Run

```bash
npm run dev                  # Next.js on :3000
npx inngest-cli@latest dev   # Inngest dev server (in a second terminal)
```

Visit `http://localhost:3000` for the marketing page and `/dashboard` for the
console. The app runs without every secret present — integrations degrade
gracefully and log a skip reason until configured.

### 4. Quality gates

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src
npm run build       # prisma generate + next build
```

---

## Environment variables

See `.env.example` for the full list. Key groups: Anthropic, Twilio WhatsApp,
Resend, Salesforce (+ configurable custom field API names), Inngest, Supabase,
Clerk, and business config (consultant name, calendar URL, contact hours).

---

## Salesforce integration

### Inbound: Flow → Outbound webhook

Create a **record-triggered Flow** on the Lead (or your Enquiry object) that
fires on create and makes an **HTTP callout** to:

```
POST https://<your-app>/api/webhooks/salesforce
Content-Type: application/json
X-OneHomes-Signature: <hex HMAC-SHA256 of the raw body, keyed with SF_WEBHOOK_SECRET>
```

JSON body (field names the webhook expects — map your SF fields to these):

```json
{
  "salesforceId": "00Q...",
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+447700900123",
  "enquiryType": "2-bed Marylebone",
  "propertyRef": "OH-MAR-204",
  "source": "Rightmove",
  "eventId": "optional-unique-id-for-idempotency"
}
```

Computing the signature: HMAC-SHA256 over the exact request body using
`SF_WEBHOOK_SECRET`, hex-encoded. In Apex you can do this with `Crypto.generateMac('hmacSHA256', body, key)`
and `EncodingUtil.convertToHex(...)`. The header may be sent raw hex or
`sha256=<hex>`.

The webhook **verifies the signature**, **dedupes** on `eventId`/`salesforceId`
(idempotency ledger), upserts the Lead, and emits `lead/created`.

### Outbound: write-back via jsforce

On each conversation update (`lead/sync-requested`) the app:

- Creates a **Task/Activity** (`WhoId` = the lead) with an AI-generated summary + a transcript link.
- Updates configurable custom fields on the Lead:
  - `AI_Status__c` (status), `Qualification__c` (JSON), `Viewing_Booked__c`,
    `Opted_Out__c`, `AI_Handled__c`.

Field API names are overridable via `SF_FIELD_*` env vars. Create these custom
fields in Salesforce (or remap to existing ones).

---

## WhatsApp setup

1. Provision a **dedicated WhatsApp business number** in Twilio and set `TWILIO_WHATSAPP_FROM` (`whatsapp:+44...`).
2. Submit the intro **template** for approval (copy below), then set `TWILIO_TEMPLATE_INTRO_SID` to its Content SID.
3. Point the Twilio inbound webhook for the number at `https://<your-app>/api/webhooks/whatsapp`.
   Inbound requests are **signature-verified** (`X-Twilio-Signature`).

### Suggested intro template copy (submit for approval)

> Hi {{1}}, this is {{2}}'s assistant at One Homes 👋 Thanks for your enquiry about
> {{3}}. I can answer any quick questions right away while {{2}} is with other
> clients — just reply here. Reply STOP to opt out.

Variables: `{{1}}` = lead first name, `{{2}}` = consultant name, `{{3}}` = enquiry.
Includes required **opt-out language**.

---

## Email

`lib/email.ts → sendIntro(lead)` sends a premium, short HTML + plain-text intro
referencing the enquiry, signed by the consultant with the AI assistant noted,
including an unsubscribe line.

---

## Dashboard

Clerk-protected (`/dashboard`). When Clerk keys are absent the app still runs
(auth is a no-op locally). Features:

- **Leads list** — status, last activity, qualification snapshot, channel.
- **Conversation view** — live transcript (polling), **Take over** button that
  sets `handoff=true`, pauses the AI, and lets the consultant type into the thread.
- **Lead detail** — qualification data, Salesforce link, manual status override,
  manual opt-out.

---

## Compliance & guardrails

- **AI self-disclosure** in the first message (system prompt + intro template/email).
- **STOP / opt-out** fully wired: STOP keyword on WhatsApp (or dashboard) sets
  `optedOut`, status `OPTED_OUT`, halts all messaging, and syncs to Salesforce.
- **Contact hours** (`CONTACT_HOURS`) respected for proactive nudges (`withinContactHours`).
- **Consent/source** stored on the Lead; only leads who enquired are messaged.
- **All webhooks signature-verified** (HMAC for Salesforce, Twilio signature for WhatsApp).
- **Rate-limiting** on public webhook endpoints (`lib/rateLimit.ts`).
- **Idempotency** on inbound webhooks (`WebhookEvent` ledger + unique `Message.providerId`).

### GDPR / data flow

Personal data stored: name, email, phone, enquiry details, and conversation
messages — the minimum needed to engage and qualify the lead. Data flow:

1. Salesforce is the system of record; the lead originates there from a genuine enquiry.
2. We store a mirror Lead + conversation transcript in Postgres to power the
   live agent and dashboard.
3. Conversation summaries + qualification + outcome are written back to Salesforce.
4. Opt-out halts processing and is reflected in both systems.

To honour erasure requests, delete the `Lead` (cascades to conversations/messages)
and remove the corresponding Salesforce record/activities. Do not store more than
is needed; review retention with your DPO.

---

## Project layout

```
src/
  app/
    api/
      inngest/route.ts                 # Inngest handler
      webhooks/salesforce/route.ts     # inbound SF (HMAC)
      webhooks/whatsapp/route.ts       # inbound Twilio (signature)
      dashboard/leads/[id]/*           # dashboard mutations (Clerk-protected)
    dashboard/                         # leads list + conversation view
    page.tsx                           # marketing landing
  components/                          # ConversationPanel, LeadControls
  lib/
    anthropic.ts  whatsapp.ts  email.ts  salesforce.ts   # swappable providers
    agent/        prompt.ts  tools.ts  index.ts  summary.ts
    inngest/      client.ts  functions/*
    config.ts  contactHours.ts  rateLimit.ts  leads.ts  logger.ts  prisma.ts
prisma/
  schema.prisma  seed.ts
```

---

## Build order status (per the brief)

1. ✅ Scaffold (Next.js/TS/Tailwind/Prisma/Clerk/Inngest, schema)
2. ✅ Salesforce inbound (webhook + HMAC + dedupe + Lead stored)
3. ✅ Outbound fan-out (`onLeadCreated`: WhatsApp template + intro email)
4. ✅ Inbound WhatsApp + agent loop (Claude + tools, 24h-window aware)
5. ✅ Salesforce write-back (summary + qualification fields)
6. ✅ Dashboard (leads list, conversation view, take-over)
7. ✅ Compliance pass (opt-out, hours, signatures, disclosure)
8. ✅ Hardening (retries, logging, idempotency on webhooks)

### Before going live — please provide

- Salesforce object/field API names (if different from defaults).
- The dedicated WhatsApp business number + approved template SID.
- Final approved template copy.
- Consultant name, booking calendar URL, and contact hours.
```
