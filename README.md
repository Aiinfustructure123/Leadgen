# One Homes AI Lead Concierge

An automated AI lead-engagement system for property consultants at **One Homes**. Every enquiry receives an instant WhatsApp template message + personalised email, followed by a real qualifying conversation powered by Claude — all within seconds of the lead arriving in Salesforce.

---

## Architecture

```
Salesforce (new Enquiry)
      │  Flow → Outbound HTTP callout (HMAC-SHA256 signed)
      ▼
POST /api/webhooks/salesforce  →  validate + dedupe + upsert Lead  →  Inngest "lead/created"
                                                                              │
                          ┌───────────────────────────────────────────────────┤
                          ▼                                                     ▼
         send WhatsApp TEMPLATE (intro + opt-in)                    send personalised intro EMAIL
                          │
        Lead replies on WhatsApp
                          ▼
POST /api/webhooks/whatsapp  →  store inbound message  →  Inngest "message/received"
                          ▼
        Agent loop (Claude + tools): build history → call model →
        {reply | tool: get_property_details / update_qualification /
         propose_viewing / book_viewing / escalate_to_human / handle_optout}
        → send free-form WhatsApp reply (within 24h window)
                          ▼
        Sync transcript + qualification + outcome to Salesforce
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript + Tailwind CSS |
| Database | Supabase (PostgreSQL) via Prisma v7 + `@prisma/adapter-pg` |
| AI | Anthropic Claude (`claude-sonnet-4-6` for chat, `claude-haiku-4-5` for classification) |
| WhatsApp | Twilio WhatsApp Business API |
| Email | Resend |
| Orchestration | Inngest |
| Salesforce | jsforce |
| Auth (dashboard) | Clerk |
| Hosting | Vercel |

---

## Quick Start

### 1. Clone and install

```bash
git clone <repo>
cd one-homes-ai-concierge
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in all values in `.env.local`. See [Environment Variables](#environment-variables) below.

### 3. Set up the database

```bash
npx prisma migrate dev --name init
```

### 4. Run locally

```bash
# In terminal 1: start the app
npm run dev

# In terminal 2: start Inngest dev server (for local event processing)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

### 5. Expose locally for webhooks (optional, for testing)

```bash
npx ngrok http 3000
```

Update your Salesforce Flow callout URL and Twilio webhook URL to the ngrok URL.

---

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_WHATSAPP_FROM` | Your WhatsApp business number (e.g. `whatsapp:+44...`) |
| `TWILIO_TEMPLATE_INTRO_SID` | Approved template content SID for first contact |
| `RESEND_API_KEY` | Resend API key |
| `DATABASE_URL` | PostgreSQL connection string (Supabase) |
| `SF_WEBHOOK_SECRET` | HMAC secret shared with Salesforce Flow |
| `INNGEST_EVENT_KEY` | Inngest event key |
| `INNGEST_SIGNING_KEY` | Inngest signing key |
| `CLERK_SECRET_KEY` | Clerk backend secret |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |
| `CONSULTANT_NAME` | Consultant's display name used in AI messages |
| `CONSULTANT_CALENDAR_URL` | Calendly / booking link shared with leads |
| `CONTACT_HOURS` | e.g. `08:00-20:00 Europe/London` |

---

## Salesforce Setup

### 1. Custom fields on Lead (create in Salesforce Setup)

| API Name | Type | Description |
|---|---|---|
| `AI_Status__c` | Text(50) | Current AI engagement status |
| `Qualification__c` | Long Text Area | JSON blob of qualification data |
| `Viewing_Booked__c` | Checkbox | True when viewing is booked via AI |
| `Opted_Out__c` | Checkbox | True when lead has opted out of messaging |

### 2. Create the outbound webhook Flow

1. Go to **Setup → Flows → New Flow → Record-Triggered Flow**
2. Trigger: **Lead** object, **Record Created** (or "Created or Updated" if you want re-triggers)
3. Add an **HTTP Callout** action:
   - **Method:** POST
   - **URL:** `https://your-domain.vercel.app/api/webhooks/salesforce`
   - **Headers:**
     - `Content-Type: application/json`
     - `X-SF-Signature: sha256={HMAC_SHA256(body, SF_WEBHOOK_SECRET)}`
     
     *(Use a Formula resource to compute the HMAC — Salesforce supports `HMAC()` formula function)*
   - **Request Body:**
     ```json
     {
       "salesforceId": "{!$Record.Id}",
       "firstName": "{!$Record.FirstName}",
       "lastName": "{!$Record.LastName}",
       "email": "{!$Record.Email}",
       "phone": "{!$Record.MobilePhone}",
       "enquiryType": "{!$Record.Description}",
       "propertyRef": "{!$Record.LeadSource}",
       "source": "{!$Record.LeadSource}"
     }
     ```
4. Save and activate the Flow.

### 3. Test with a mock payload

```bash
curl -X POST https://your-domain/api/webhooks/salesforce \
  -H "Content-Type: application/json" \
  -H "X-SF-Signature: " \
  -d '{
    "salesforceId": "00Q000000TEST001",
    "firstName": "Alice",
    "lastName": "Smith",
    "email": "alice@example.com",
    "phone": "+447900000000",
    "enquiryType": "2-bed flat in Marylebone",
    "propertyRef": "OH-2024-001",
    "source": "Website"
  }'
```

*Leave X-SF-Signature empty when `SF_WEBHOOK_SECRET` is not set (development only).*

---

## WhatsApp Setup

### 1. Get a Twilio WhatsApp Business number

1. Sign up at [twilio.com](https://www.twilio.com)
2. Go to **Messaging → Senders → WhatsApp Senders** and request a dedicated number
3. Set `TWILIO_WHATSAPP_FROM=whatsapp:+44YOUR_NUMBER`

### 2. Submit intro template for approval

Submit the following template to Twilio (Messaging → Content Template Builder):

**Template name:** `one_homes_intro`  
**Category:** MARKETING  
**Language:** en  
**Body:**
```
Hi {{1}}, I'm the AI assistant for [CONSULTANT_NAME] at One Homes.

You recently enquired about {{2}} — I'm here to answer any questions and help you find your perfect home while [CONSULTANT_NAME] is with other clients.

What would you like to know?

Reply STOP to opt out of messages.
```

Once approved, set `TWILIO_TEMPLATE_INTRO_SID=HXxxxxxxxxx` (the Content SID).

### 3. Configure inbound webhook in Twilio

In your Twilio WhatsApp number settings, set the webhook URL:
- **When a message comes in:** `https://your-domain.vercel.app/api/webhooks/whatsapp`
- **Method:** HTTP POST

---

## Dashboard

Navigate to `https://your-domain/dashboard` and sign in with Clerk.

**Features:**
- **Leads list** — all leads with status, qualification snapshot, last activity
- **Conversation view** — live transcript with role-coloured messages (Lead / AI / Human / System)
- **Take Over** — pauses AI and lets the consultant type directly into the WhatsApp thread
- **Lead detail** — qualification data, Salesforce link, status override, opt-out button
- **Auto-refresh** — polls every 5–10 seconds; no WebSockets needed

---

## Compliance & Data

### GDPR / Data minimisation

- We store only: name, email, phone, enquiry type, property ref, source (all sourced from the lead's own enquiry)
- Qualification data is stored as a JSON field on the Lead record
- Message bodies are stored for conversation continuity and Salesforce logging
- No data is shared with third parties beyond: Twilio (message delivery), Anthropic (AI), Resend (email), Salesforce (CRM)

### Opt-out

- Sending **STOP**, **UNSUBSCRIBE**, **CANCEL**, **QUIT**, or **OPT OUT** at any point triggers `handle_optout`
- The lead is flagged in the DB and Salesforce, status set to `OPTED_OUT`, and no further messages are sent
- AI confirms the opt-out in one final message, then stops

### AI disclosure

- The AI introduces itself as "[CONSULTANT_NAME]'s AI assistant" in the first message
- It never claims to be human
- It escalates to a human on request or for sensitive topics

### Contact hours

- Configured via `CONTACT_HOURS` env var (default: `08:00-20:00 Europe/London`)
- New lead fan-out is skipped outside contact hours (queuing for production is a future enhancement)
- The AI is mindful of timezone in the system prompt

### Webhook security

- Salesforce webhooks verified via HMAC-SHA256 (`X-SF-Signature` header)
- Twilio webhooks verified via Twilio's own signature validation
- Both webhook endpoints rate-limited (30 and 60 req/min respectively)

---

## AI Agent Tools

The Claude agent has access to 6 tools:

| Tool | Purpose |
|---|---|
| `get_property_details` | Fetch property facts — never invented by the AI |
| `update_qualification` | Persist budget, beds, location, timeline, buyer type, etc. |
| `propose_viewing` | Surface available slots or share the booking calendar URL |
| `book_viewing` | Confirm a specific viewing slot |
| `escalate_to_human` | Hand off to the consultant, stop AI replies |
| `handle_optout` | Process opt-out request, halt all messaging |

---

## Model Configuration

Models are set in `src/lib/config.ts`:

```typescript
export const AI_MODELS = {
  conversation: "claude-sonnet-4-6",       // fast + high quality for live chat
  classification: "claude-haiku-4-5-20251001",  // cheap for summaries / scoring
};
```

Change to `claude-opus-4-5` for higher quality, or `claude-haiku-4-5-20251001` for lower cost.

---

## Deployment (Vercel)

1. Push to GitHub
2. Import into Vercel
3. Set all environment variables in Vercel Dashboard
4. Set `NEXT_PUBLIC_BASE_URL` to your Vercel deployment URL
5. Run the Prisma migration against your production database:
   ```bash
   DATABASE_URL=<prod_url> npx prisma migrate deploy
   ```
6. Update Twilio and Salesforce webhook URLs to the Vercel URL

---

## Development Notes

- All external service calls are behind `lib/*.ts` interfaces — swap providers without touching business logic
- Business copy (template text, email, system prompt) is config-driven via `src/lib/config.ts`
- Inngest handles all retry logic and durable execution — API routes are thin receivers only
- The 24h WhatsApp customer-care window is tracked via `Lead.lastInboundAt`
