#!/usr/bin/env tsx
/**
 * Mock test script — simulates a Salesforce new-lead webhook.
 * Run with: npx tsx scripts/test-webhook.ts
 *
 * Requires the dev server to be running at localhost:3000
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const mockLead = {
  salesforceId: `00Q${Date.now()}`,
  firstName: "Alice",
  lastName: "Smith",
  email: "alice.smith@example.com",
  phone: "+447900000001",
  enquiryType: "2-bed flat in Marylebone",
  propertyRef: "OH-2024-001",
  source: "Website",
};

async function testSalesforceWebhook() {
  console.log("📨 Sending mock Salesforce webhook...");
  console.log("Payload:", JSON.stringify(mockLead, null, 2));

  const response = await fetch(`${BASE_URL}/api/webhooks/salesforce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockLead),
  });

  const data = await response.json();
  console.log(`\n✅ Response (${response.status}):`, JSON.stringify(data, null, 2));

  if (!response.ok) {
    process.exit(1);
  }

  return data.leadId as string;
}

async function testWhatsAppWebhook(phone: string) {
  console.log("\n💬 Simulating inbound WhatsApp message...");

  const params = new URLSearchParams({
    From: `whatsapp:${phone}`,
    Body: "Hi, I saw your property listing. Can you tell me more about the 2-bed flat?",
    MessageSid: `SM${Date.now()}`,
    AccountSid: "AC_TEST",
  });

  const response = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  console.log(`\n✅ WhatsApp webhook response (${response.status})`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testOptOut(phone: string) {
  console.log("\n🛑 Simulating STOP (opt-out)...");

  const params = new URLSearchParams({
    From: `whatsapp:${phone}`,
    Body: "STOP",
    MessageSid: `SM${Date.now()}_stop`,
    AccountSid: "AC_TEST",
  });

  const response = await fetch(`${BASE_URL}/api/webhooks/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  console.log(`\n✅ Opt-out webhook response (${response.status})`);
}

async function main() {
  try {
    const leadId = await testSalesforceWebhook();
    console.log(`\n🎉 Lead created with ID: ${leadId}`);
    console.log("   → Check Inngest dev server for the fan-out job execution");
    console.log("   → WhatsApp template and email should be sent shortly");

    // Wait a moment, then simulate a reply
    console.log("\n⏳ Waiting 2s before simulating lead reply...");
    await new Promise((r) => setTimeout(r, 2000));

    await testWhatsAppWebhook(mockLead.phone);
    console.log("   → Check Inngest dev server for the agent loop execution");
    console.log("   → Claude should reply to the lead via WhatsApp");

    console.log("\n✨ Test complete. Visit http://localhost:3000/dashboard to see the lead.");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main();
