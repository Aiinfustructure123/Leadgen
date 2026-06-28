# One Homes AI Lead Concierge

Automated AI lead engagement for One Homes enquiries. A Salesforce webhook stores a lead, Inngest fans out a WhatsApp template and intro email, Twilio replies trigger a Claude tool-use agent, and the outcome is synced back to Salesforce.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- Prisma 7 against Supabase/Postgres
- Inngest for durable event orchestration
- Anthropic Claude for conversation and transcript summaries
- Twilio WhatsApp Business API
- Resend email
- jsforce Salesforce client
- Clerk-protected dashboard

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy placeholders and fill real credentials:

   ```bash
   cp .env.example .env.local
   ```

   Do not guess live values. Before going live we still need:

   - Salesforce object and field API names, if the defaults are not correct.
   - Dedicated Twilio WhatsApp sender number.
   - Approved Twilio/Meta template SID and final approved template copy.
   - Consultant name, contact hours, and booking URL.

3. Generate Prisma client:

   ```bash
   npm run prisma:generate
   ```

4. Apply the schema to Supabase/Postgres:

   ```bash
   npm run prisma:migrate
   ```

5. Run the app:

   ```bash
   npm run dev
   ```

## Environment variables

See `.env.example` for all required variables. Secrets are intentionally not committed.

`APP_BASE_URL` is used when provider signatures or Salesforce transcript links require the public URL. On Vercel it falls back to `VERCEL_URL`.

## Main flow

1. Salesforce Flow sends a signed JSON webhook to `POST /api/webhooks/salesforce`.
2. The route verifies `x-onehomes-signature`, dedupes the event, upserts `Lead`, and emits `lead/created`.
3. Inngest `onLeadCreated` sends:
   - WhatsApp approved intro template via Twilio.
   - Personalised intro email via Resend.
4. Twilio sends inbound WhatsApp replies to `POST /api/webhooks/whatsapp`.
5. The route verifies Twilio signature, stores the inbound message, handles STOP immediately, and emits `message/received`.
6. Inngest `onMessageReceived` loads history, runs Claude with tools, sends a policy-aware free-form WhatsApp reply inside the 24-hour window, and emits `salesforce/sync`.
7. `syncToSalesforce` writes a Task/Activity plus configurable qualification/status fields.

## Salesforce Flow setup notes

Create a record-triggered Flow on the lead/enquiry object for newly created enquiries. The outbound HTTP callout should:

- Method: `POST`
- URL: `https://<your-app-domain>/api/webhooks/salesforce`
- Header: `content-type: application/json`
- Header: `x-onehomes-signature: sha256=<hex hmac sha256 of raw body using SF_WEBHOOK_SECRET>`

Payload fields expected by the app:

```json
{
  "salesforceId": "00Q...",
  "firstName": "Amira",
  "lastName": "Khan",
  "email": "amira@example.com",
  "phone": "+447700900000",
  "enquiryType": "2-bed Marylebone",
  "propertyRef": "OH-MARY-2B",
  "source": "Website enquiry",
  "consentSource": "Website property enquiry form"
}
```

Outbound Salesforce defaults are configurable:

- `SALESFORCE_LEAD_OBJECT=Lead`
- `SALESFORCE_TASK_OBJECT=Task`
- `SALESFORCE_FIELD_AI_STATUS=AI_Status__c`
- `SALESFORCE_FIELD_QUALIFICATION=Qualification__c`
- `SALESFORCE_FIELD_VIEWING_BOOKED=Viewing_Booked__c`
- `SALESFORCE_FIELD_OPTED_OUT=Opted_Out__c`
- `SALESFORCE_FIELD_AI_HANDLED=AI_Handled__c`

## WhatsApp template copy to submit

Submit a business-initiated template similar to:

> Hi {{1}}, thanks for your enquiry about {{3}}. I am {{2}}'s AI assistant at One Homes. I can answer quick questions or help arrange a viewing while {{2}} is with clients. Reply STOP to opt out.

The first outbound WhatsApp contact always uses `TWILIO_TEMPLATE_INTRO_SID`. Free-form AI and human replies are allowed only within 24 hours of the lead's last inbound WhatsApp message.

## Dashboard

`/dashboard` is Clerk-protected and shows:

- Lead list with status, enquiry, last activity, and qualification snapshot.
- Lead detail with WhatsApp/email transcripts.
- Take-over button that sets `handoff=true` and pauses AI replies.
- Manual WhatsApp reply box, manual status override, and manual opt-out.

## Compliance and data flow

- Public webhooks are signature-verified and rate-limited.
- STOP/unsubscribe language marks the lead opted out, confirms once, stops future AI messaging, and queues Salesforce sync.
- Contact hours are parsed from `CONTACT_HOURS`; Inngest delays outbound work until the next window where appropriate.
- The AI prompt requires self-disclosure and forbids invented property, price, legal, tax, mortgage, or negotiation advice.
- Property facts must come from the local `Property` table or Salesforce lookup through `get_property_details`.
- Stored personal data is limited to lead contact details, source/consent source, conversation messages, qualification JSON, and provider message metadata needed for audit/debugging.

## Useful commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
```
