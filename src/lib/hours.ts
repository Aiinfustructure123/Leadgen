import { BUSINESS } from "./config";

/**
 * Parse CONTACT_HOURS of the form "HH:MM-HH:MM Area/City" and determine
 * whether "now" falls within contact hours in that timezone.
 */
export interface ContactHours {
  startMinutes: number; // minutes from midnight
  endMinutes: number;
  timeZone: string;
}

export function parseContactHours(raw = BUSINESS.contactHours): ContactHours {
  // e.g. "08:00-20:00 Europe/London"
  const match = raw.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\s+(.+)$/);
  if (!match) {
    return { startMinutes: 8 * 60, endMinutes: 20 * 60, timeZone: "Europe/London" };
  }
  const [, sh, sm, eh, em, tz] = match;
  return {
    startMinutes: parseInt(sh, 10) * 60 + parseInt(sm, 10),
    endMinutes: parseInt(eh, 10) * 60 + parseInt(em, 10),
    timeZone: tz.trim(),
  };
}

/** Current minutes-from-midnight in the given timezone. */
function nowMinutesInTz(timeZone: string, now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  return hour * 60 + minute;
}

export function isWithinContactHours(now: Date = new Date()): boolean {
  const { startMinutes, endMinutes, timeZone } = parseContactHours();
  const cur = nowMinutesInTz(timeZone, now);
  if (startMinutes <= endMinutes) {
    return cur >= startMinutes && cur < endMinutes;
  }
  // Overnight window (e.g. 20:00-08:00)
  return cur >= startMinutes || cur < endMinutes;
}

/**
 * Returns the next Date at which contact hours open. If currently within
 * hours, returns `now`.
 */
export function nextContactWindowOpen(now: Date = new Date()): Date {
  if (isWithinContactHours(now)) return now;
  const { startMinutes, timeZone } = parseContactHours();

  // Walk forward minute-coarse: find the next time the window is open.
  // We compute the target wall-clock start time in the tz, then convert.
  for (let addDays = 0; addDays <= 1; addDays++) {
    const candidate = wallClockToDate(now, timeZone, startMinutes, addDays);
    if (candidate > now) return candidate;
  }
  // Fallback: 1 hour out.
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/**
 * Build a Date representing a wall-clock time (minutesFromMidnight) on
 * (today + addDays) in `timeZone`.
 */
function wallClockToDate(
  ref: Date,
  timeZone: string,
  minutesFromMidnight: number,
  addDays: number
): Date {
  // Get the y/m/d for ref in the target tz.
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  });
  const parts = dateFmt.formatToParts(ref);
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);

  const hh = Math.floor(minutesFromMidnight / 60);
  const mm = minutesFromMidnight % 60;

  // Construct a UTC guess then correct for the tz offset at that instant.
  const baseUtc = Date.UTC(year, month - 1, day + addDays, hh, mm, 0);
  const offset = tzOffsetMs(new Date(baseUtc), timeZone);
  return new Date(baseUtc - offset);
}

/** Offset (ms) of the timezone at a given instant: localTime - utcTime. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second
  );
  return asUtc - date.getTime();
}
