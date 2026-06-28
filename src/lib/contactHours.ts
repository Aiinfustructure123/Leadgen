import { config } from "@/lib/config";

/**
 * Parse CONTACT_HOURS ("08:00-20:00 Europe/London") and decide whether `now`
 * falls within the allowed contact window in the configured timezone.
 *
 * Returns true if hours can't be parsed (fail-open is safer than silently never
 * sending), but logs nothing here — callers decide policy.
 */
export function withinContactHours(now: Date = new Date()): boolean {
  const parsed = parseContactHours(config.contactHours);
  if (!parsed) return true;

  const { startMinutes, endMinutes, timeZone } = parsed;
  const minutesNow = minutesInTimeZone(now, timeZone);
  if (minutesNow === null) return true;

  if (startMinutes <= endMinutes) {
    return minutesNow >= startMinutes && minutesNow < endMinutes;
  }
  // Overnight window (e.g. 20:00-08:00).
  return minutesNow >= startMinutes || minutesNow < endMinutes;
}

export interface ParsedContactHours {
  startMinutes: number;
  endMinutes: number;
  timeZone: string;
}

export function parseContactHours(value: string): ParsedContactHours | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})(?:\s+(.+))?$/);
  if (!match) return null;
  const [, sh, sm, eh, em, tz] = match;
  return {
    startMinutes: Number(sh) * 60 + Number(sm),
    endMinutes: Number(eh) * 60 + Number(em),
    timeZone: tz?.trim() || "Europe/London",
  };
}

/** Current minutes-since-midnight in a given IANA timezone. */
function minutesInTimeZone(date: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return hour * 60 + minute;
  } catch {
    return null;
  }
}
