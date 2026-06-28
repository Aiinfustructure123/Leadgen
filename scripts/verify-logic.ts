/**
 * Lightweight assertions for the compliance-critical pure logic that doesn't
 * need external services. Run: npx tsx scripts/verify-logic.ts
 */
import assert from "node:assert";
import { isOptOut } from "../src/lib/optout";
import { verifyHmac } from "../src/lib/crypto";
import { isWithinWhatsAppWindow } from "../src/lib/messaging";
import { mergeQualification, qualificationSummary } from "../src/lib/qualification";
import { isWithinContactHours, parseContactHours } from "../src/lib/hours";
import crypto from "node:crypto";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log("Opt-out detection:");
check("STOP triggers opt-out", () => assert.equal(isOptOut("STOP"), true));
check("stop. (punctuation) triggers", () => assert.equal(isOptOut("stop."), true));
check("'please remove me' triggers", () =>
  assert.equal(isOptOut("please remove me from this"), true));
check("'unsubscribe' triggers", () => assert.equal(isOptOut("Unsubscribe"), true));
check("normal text does not", () =>
  assert.equal(isOptOut("Can you stop by the flat tomorrow?"), false));
check("empty does not", () => assert.equal(isOptOut("   "), false));

console.log("HMAC verification:");
const secret = "test-secret";
const body = JSON.stringify({ a: 1 });
const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
check("valid signature passes", () => assert.equal(verifyHmac(body, sig, secret), true));
check("sha256= prefix accepted", () =>
  assert.equal(verifyHmac(body, `sha256=${sig}`, secret), true));
check("tampered body fails", () =>
  assert.equal(verifyHmac(body + "x", sig, secret), false));
check("wrong secret fails", () =>
  assert.equal(verifyHmac(body, sig, "nope"), false));
check("missing signature fails", () => assert.equal(verifyHmac(body, null, secret), false));

console.log("24h WhatsApp window:");
check("no inbound => outside window", () =>
  assert.equal(isWithinWhatsAppWindow({ lastInboundAt: null }), false));
check("1h ago => inside", () =>
  assert.equal(
    isWithinWhatsAppWindow({ lastInboundAt: new Date(Date.now() - 60 * 60 * 1000) }),
    true
  ));
check("25h ago => outside", () =>
  assert.equal(
    isWithinWhatsAppWindow({ lastInboundAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }),
    false
  ));

console.log("Qualification merge:");
check("merges and drops empties", () => {
  const merged = mergeQualification({ budget: "£1m" }, { location: "W1", beds: "" });
  assert.equal(merged.budget, "£1m");
  assert.equal(merged.location, "W1");
  assert.equal(merged.beds, undefined);
});
check("summary renders", () =>
  assert.ok(qualificationSummary({ budget: "£1m", beds: "2" }).includes("Budget")));

console.log("Contact hours parsing:");
check("parses 08:00-20:00 Europe/London", () => {
  const p = parseContactHours("08:00-20:00 Europe/London");
  assert.equal(p.startMinutes, 480);
  assert.equal(p.endMinutes, 1200);
  assert.equal(p.timeZone, "Europe/London");
});
check("isWithinContactHours returns boolean", () =>
  assert.equal(typeof isWithinContactHours(), "boolean"));

console.log(`\nAll ${passed} checks passed.`);
