/**
 * Fire a signed mock Salesforce enquiry at the local webhook to test the
 * end-to-end pipeline.
 *
 * Usage:
 *   SF_WEBHOOK_SECRET=dev-secret npx tsx scripts/mock-salesforce-webhook.ts
 *
 * Optional env:
 *   WEBHOOK_URL (default http://localhost:3000/api/webhooks/salesforce)
 */
import crypto from "crypto";

const url =
  process.env.WEBHOOK_URL ?? "http://localhost:3000/api/webhooks/salesforce";
const secret = process.env.SF_WEBHOOK_SECRET ?? "dev-secret";

const payload = {
  salesforceId: `00Q${Date.now()}`,
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@example.com",
  phone: process.env.TEST_PHONE ?? "+447700900123",
  enquiryType: "2-bed Marylebone",
  propertyRef: "OH-MARY-201",
  source: "Rightmove",
  eventId: `evt-${Date.now()}`,
};

const body = JSON.stringify(payload);
const signature = crypto
  .createHmac("sha256", secret)
  .update(body, "utf8")
  .digest("hex");

async function main() {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onehomes-signature": signature,
    },
    body,
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
