# One Homes — AI Lead Concierge

An automated AI lead-engagement system for a senior property consultant at **One Homes**.
The moment a new enquiry lands in Salesforce, it:

1. Sends the lead a **WhatsApp** template message within seconds.
2. Sends a **personalised intro email** at the same time.
3. Holds a **real, contextual, qualifying conversation** on WhatsApp powered by Claude — answering
   questions, qualifying the lead, booking a viewing/call, or handing off to the human consultant.
4. Logs the full conversation, qualification data, and outcome **back into Salesforce**.
5. Gives the consultant a **dashboard** to watch live conversations and take over at any time.

---

## Tech stack

| Concern             | Choice                                                              |
| ------------------- | ------------------------------------------------------------------- |
| Framework           | Next.js (App Router) + TypeScript + Tailwind CSS                    |
| Database            | Supabase (Postgres) via Prisma ORM                                  |
| AI                  | Anthropic Claude (`claude-sonnet-4-6` chat, `claude-haiku-4-5` cheap classify) |
| WhatsApp            | Twilio WhatsApp Business API (behind `lib/whatsapp.ts`)             |
| Email               | Resend (behind `lib/email.ts`)                                      |
| Orchestration       | Inngest (fan-out, retries, delays, wait-for-reply)                  |
| Salesforce          | `jsforce` (write-back via `lib/salesforce.ts`)                      |
| Dashboard auth      | Clerk                                                               |
| Hosting             | Vercel                                                              |

All vendor calls live behind `src/lib/*` interfaces so WhatsApp/email/AI/CRM providers are swappable
without touching business logic. All business copy and config (persona, contact hours, model names,
Salesforce field API names) is driven from `src/lib/config.ts` + env vars.

---

## Architecture & flow

```
Salesforce (new Enquiry)
      │  Flow → Outbound HTTP callout (HMAC-signed)
      ▼
POST /api/webhooks/salesforce  ──►  verify HMAC + dedupe + upsert Lead  ──►  Inngest "lead/created"
                                                                              │
                          ┌───────────────────────────────────────────────────┤
                          ▼                                                     ▼
         send WhatsApp TEMPLATE (intro + opt-in)                  send personalised intro EMAIL
                          │                                          (status → CONTACTED)
        Lead replies on WhatsApp
                          ▼
POST /api/webhooks/whatsapp  ──►  verify Twilio sig + dedupe + store inbound  ──►  Inngest "message/received"
                          ▼
        Agent loop (Claude + tools): history → model →
        {reply | get_property_details | update_qualification |
         propose/book_viewing | escalate_to_human | handle_optout} → send reply
                          ▼
        Inngest "lead/sync-salesforce": transcript summary + qualification + status write-back
```

**24-hour rule (honoured everywhere):** outside the 24h customer-care window only pre-approved
**templates** may be sent. Inside the window (after the lead messages) free-form AI replies are allowed.
`lib/messaging.ts#isWithinWhatsAppWindow` gates every free-form send; outside the window it records a
SYSTEM note prompting a template instead.

---

## Getting started

### 1. Install

```bash
npm install
cp .env.example .env.local   # then fill in values
```

### 2. Database

Point `DATABASE_URL` (and `DIRECT_URL` for migrations) at your Supabase Postgres, then:

```bash
npx prisma migrate dev --name init   # local dev
# or, for an existing/hosted DB:
npx prisma migrate deploy
npx prisma db seed                   # optional: seeds a sample property
```

### 3. Run

```bash
npm run dev                 # Next.js on http://localhost:3000
npx inngest-cli@latest dev  # Inngest dev server (in another terminal)
```

The dashboard is at `/dashboard`. With Clerk env vars set it's protected; without them it falls
through (handy for local bootstrapping — **set Clerk before deploying**).

### 4. Build / checks

```bash
npm run typecheck
npm run build
```

---

## Environment variables

See `.env.example` for the full list. Key ones:

- `ANTHROPIC_API_KEY` — Claude. Models are config constants in `src/lib/config.ts` (`MODELS`); swap
  `ANTHROPIC_CONVERSATION_MODEL` to an Opus model for higher quality.
- `TWILIO_*` — account SID/auth token, `TWILIO_WHATSAPP_FROM` (`whatsapp:+44...`), and
  `TWILIO_TEMPLATE_INTRO_SID` (approved Content template for first contact).
- `RESEND_API_KEY`, `EMAIL_FROM`.
- `SF_*` — Salesforce login + OAuth + `SF_WEBHOOK_SECRET` (HMAC) + configurable field API names
  (`SF_FIELD_AI_STATUS`, etc.).
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`.
- `DATABASE_URL`, `DIRECT_URL`.
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- Business: `CONSULTANT_NAME`, `CONSULTANT_PHONE` (E.164, for escalation pings), `CONSULTANT_CALENDAR_URL`,
  `CONTACT_HOURS` (e.g. `08:00-20:00 Europe/London`), `COMPANY_NAME`.

---

## Salesforce setup

### Inbound (new enquiry → us)

1. Create a **record-triggered Flow** on the Lead/Enquiry object (on create).
2. Add an **HTTP Callout** (or invocable Apex) action that POSTs JSON to
   `https://YOUR_APP/api/webhooks/salesforce`.
3. **Sign the body** with `SF_WEBHOOK_SECRET` using HMAC-SHA256 and send the hex digest in the
   `x-onehomes-signature` header (a small Apex helper can compute
   `Crypto.generateMac('HmacSHA256', body, secret)`). The endpoint rejects unsigned/invalid requests.

**Payload fields:**

```json
{
  "salesforceId": "00Q...",          // required — Lead/Contact Id
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+447700900123",          // E.164
  "enquiryType": "2-bed Marylebone",
  "propertyRef": "OH-MARY-201",
  "source": "Rightmove",
  "eventId": "unique-event-id"        // optional, used for idempotency
}
```

The endpoint verifies the HMAC, dedupes (by `eventId` or `salesforceId`), upserts the Lead, and only
fans out WhatsApp + email for genuinely **new** leads.

### Outbound (us → Salesforce)

On each conversation update, `lib/salesforce.ts` (via the `lead/sync-salesforce` Inngest function):

- Updates configurable custom fields on the Lead: `AI_Status__c`, `Qualification__c` (JSON),
  `Viewing_Booked__c`, `Opted_Out__c` (override API names with `SF_FIELD_*`).
- Creates a **Task/Activity** with an AI-generated transcript summary + a link back to the dashboard
  conversation.

> ⚠️ Before go-live, confirm the **object and field API names** for your org. Create the custom fields
> above (or set `SF_FIELD_*` to match existing fields). The property lookup fallback
> (`fetchPropertyFromSalesforce`) is intentionally left unimplemented until the property object/field
> API names are supplied — the Prisma `Property` table is the primary source of truth.

---

## WhatsApp setup

1. Connect a dedicated WhatsApp business number in Twilio; set `TWILIO_WHATSAPP_FROM`.
2. Submit the **intro template** for approval (below) and set `TWILIO_TEMPLATE_INTRO_SID`.
3. Configure the inbound webhook in Twilio to `https://YOUR_APP/api/webhooks/whatsapp` (POST). Twilio
   request signatures are verified on every inbound message.

### Intro template copy (submit for approval)

Variables: `{{1}}` = lead first name, `{{2}}` = consultant name, `{{3}}` = enquiry.

```
Hi {{1}}, this is {{2}}'s assistant at One Homes 👋 Thanks for your enquiry about {{3}}.
I'm an AI helper and can answer your questions right away while {{2}} is with other clients —
just reply here and we'll get started. Reply STOP to opt out at any time.
```

The template **must** include opt-out language ("Reply STOP to opt out").

---

## The conversation engine

`src/lib/agent/` is the heart of the system:

- `prompt.ts` — config-driven system prompt injecting persona, contact hours, lead context, and known
  qualification. Enforces hard rules (never invent facts, no financial/legal advice, no price
  negotiation, escalate on complaints/requests for a human, respect contact hours, honour STOP).
- `tools.ts` — Anthropic tool definitions + handlers:
  - `get_property_details(propertyRef)` — authoritative facts from the DB (`Property`). The AI never
    invents facts; if not found it tells the lead it will confirm.
  - `update_qualification(fields)` — persists budget/location/beds/timeline/buyerType/financing/viewingInterest.
  - `propose_viewing(slots)` / `book_viewing(slot)` — surface availability or share the calendar link.
  - `escalate_to_human(reason)` — sets `handoff=true`, notifies the consultant, stops AI replies.
  - `handle_optout()` — sets `optedOut=true`, status `OPTED_OUT`, halts messaging.
- `index.ts` — the agent loop: builds history → calls Claude with tools → executes tool calls →
  returns the reply + accumulated side effects.

---

## Compliance & guardrails

- **AI self-disclosure** in the first template + the system prompt.
- **STOP / opt-out** fully wired: deterministic keyword detection in the webhook (`lib/optout.ts`) plus
  the agent `handle_optout` tool; halts messaging, flags the Lead, syncs `Opted_Out__c` to Salesforce.
  A public `/preferences?lead=<id>` page (linked from the email) also lets leads unsubscribe.
- **Contact hours** respected (`lib/hours.ts`, timezone-aware); the stale-lead nudge waits for the
  window to open and only ever prompts a template (never a free-form send) outside the 24h window.
- **Consent/source** stored on the Lead; we only message leads who enquired (unknown WhatsApp senders
  are ignored, not auto-created).
- **All webhooks signature-verified** (HMAC for Salesforce, Twilio signature for WhatsApp) and
  **rate-limited** (`lib/ratelimit.ts`).
- **Idempotency** on both webhooks via a `WebhookEvent` dedupe table.

### GDPR / data flow

- **What we store:** name, email, phone, enquiry details, source, conversation transcript, and derived
  qualification data — the minimum needed to engage and qualify the lead.
- **Why:** legitimate interest in responding to an enquiry the person initiated.
- **Flow:** Salesforce (origin) → our Postgres (operational store) → Anthropic (transient processing of
  message content for replies; not used for training via the API) → back to Salesforce (system of record).
- **Retention/erasure:** deleting a Lead cascades to its conversations/messages (`onDelete: Cascade`).
  Wire a scheduled job to purge stale opted-out/dead leads per your retention policy.
- **Opt-out:** honoured immediately and propagated to Salesforce.
- Do not log message bodies to third-party log sinks beyond what's necessary.

---

## Project structure

```
src/
  app/
    api/
      inngest/route.ts            # Inngest handler
      webhooks/salesforce/route.ts
      webhooks/whatsapp/route.ts
    dashboard/                    # Clerk-protected console
      page.tsx                    # leads list
      leads/[id]/page.tsx         # conversation view + controls
      actions.ts                  # server actions (take over, send, status, opt-out)
    preferences/page.tsx          # public unsubscribe
    page.tsx                      # marketing/home
  components/                     # StatusBadge, Composer, LeadControls, AutoRefresh
  lib/
    agent/                        # prompt, tools, loop
    inngest/                      # client + functions
    whatsapp.ts email.ts salesforce.ts anthropic.ts   # provider interfaces
    config.ts messaging.ts hours.ts optout.ts crypto.ts idempotency.ts ratelimit.ts ...
prisma/
  schema.prisma  seed.ts
```

---

## Acceptance test scenarios

- ✅ Mock Salesforce enquiry → WhatsApp template + email within seconds; status → `CONTACTED`.
- ✅ WhatsApp reply → contextual, on-brand Claude reply; qualification fields populate over the chat.
- ✅ Invented property question → AI calls `get_property_details` or declines to guess.
- ✅ Price negotiation / complaint / "speak to a person" → `escalate_to_human`, AI stops.
- ✅ "STOP" → opt-out confirmed, no further messages, Salesforce flagged.
- ✅ Consultant clicks "Take over" → AI pauses, human messages flow through.
- ✅ Everything appears back in Salesforce as an Activity + updated fields.

See `scripts/mock-salesforce-webhook.ts` to fire a signed mock enquiry at the local endpoint.

---

## Before go-live — needed from the business

1. **Salesforce** object + field API names (and create the custom write-back fields).
2. The **dedicated WhatsApp business number** + the **approved intro template** SID.
3. Final **persona voice**, contact hours, and calendar/booking URL.
```
