import { describe, expect, it } from "vitest";

import {
  isInsideContactHours,
  isInsideWhatsAppCareWindow,
  nextContactWindowStart,
} from "@/lib/contact-hours";
import { isOptOutMessage } from "@/lib/leads";

describe("contact and WhatsApp policy", () => {
  it("detects contact hours in the configured timezone", () => {
    expect(isInsideContactHours(new Date("2026-06-28T09:00:00.000Z"), "08:00-20:00 Europe/London")).toBe(true);
    expect(isInsideContactHours(new Date("2026-06-28T22:00:00.000Z"), "08:00-20:00 Europe/London")).toBe(false);
  });

  it("calculates the next contact window start", () => {
    const next = nextContactWindowStart(
      new Date("2026-06-28T22:00:00.000Z"),
      "08:00-20:00 Europe/London",
    );

    expect(next.toISOString()).toBe("2026-06-29T07:00:00.000Z");
  });

  it("enforces the 24-hour WhatsApp customer-care window", () => {
    const now = new Date("2026-06-28T12:00:00.000Z");

    expect(isInsideWhatsAppCareWindow(new Date("2026-06-27T13:00:00.000Z"), now)).toBe(true);
    expect(isInsideWhatsAppCareWindow(new Date("2026-06-27T11:59:00.000Z"), now)).toBe(false);
  });

  it("detects common opt-out language", () => {
    expect(isOptOutMessage("STOP")).toBe(true);
    expect(isOptOutMessage("unsubscribe please")).toBe(true);
    expect(isOptOutMessage("Can I book a viewing?")).toBe(false);
  });
});
