/**
 * Contact hours utility.
 * Parses CONTACT_HOURS env var ("HH:MM-HH:MM Timezone") and checks
 * whether the current time is within the allowed window.
 */

import { CONTACT_HOURS } from "./config";

export function isWithinContactHours(now: Date = new Date()): boolean {
  try {
    const [timeRange, timezone] = CONTACT_HOURS.split(" ");
    const [startStr, endStr] = timeRange.split("-");

    const [startH, startM] = startStr.split(":").map(Number);
    const [endH, endM] = endStr.split(":").map(Number);

    // Get current time in the configured timezone
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(now);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);

    const currentMinutes = hour * 60 + minute;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    // Fail open — allow sending if config is malformed
    return true;
  }
}

export function isWithinWhatsAppWindow(lastInboundAt: Date | null): boolean {
  if (!lastInboundAt) return false;
  const windowMs = 24 * 60 * 60 * 1000;
  return Date.now() - lastInboundAt.getTime() < windowMs;
}
