import { toZonedTime, fromZonedTime } from "date-fns-tz";

import { appConfig, WHATSAPP_CARE_WINDOW_HOURS } from "@/lib/config";

type ParsedContactHours = {
  startMinutes: number;
  endMinutes: number;
  timeZone: string;
};

function parseContactHours(value: string): ParsedContactHours {
  const [range, ...timeZoneParts] = value.trim().split(/\s+/);
  const [start, end] = range.split("-");
  const timeZone = timeZoneParts.join(" ") || "Europe/London";

  return {
    startMinutes: parseTime(start),
    endMinutes: parseTime(end),
    timeZone
  };
}

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    throw new Error(`Invalid CONTACT_HOURS time value: ${value}`);
  }
  return hours * 60 + minutes;
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function contactWindow(now = new Date(), value = appConfig.contactHours) {
  const parsed = parseContactHours(value);
  const localNow = toZonedTime(now, parsed.timeZone);
  const currentMinutes = minutesSinceMidnight(localNow);
  const within =
    parsed.startMinutes <= parsed.endMinutes
      ? currentMinutes >= parsed.startMinutes && currentMinutes < parsed.endMinutes
      : currentMinutes >= parsed.startMinutes || currentMinutes < parsed.endMinutes;

  return {
    within,
    timeZone: parsed.timeZone,
    nextOpenAt: within ? now : nextOpening(now, parsed)
  };
}

function nextOpening(now: Date, parsed: ParsedContactHours): Date {
  const localNow = toZonedTime(now, parsed.timeZone);
  const currentMinutes = minutesSinceMidnight(localNow);
  const localOpening = new Date(localNow);
  localOpening.setSeconds(0, 0);

  if (currentMinutes < parsed.startMinutes) {
    localOpening.setHours(Math.floor(parsed.startMinutes / 60), parsed.startMinutes % 60, 0, 0);
  } else {
    localOpening.setDate(localOpening.getDate() + 1);
    localOpening.setHours(Math.floor(parsed.startMinutes / 60), parsed.startMinutes % 60, 0, 0);
  }

  return fromZonedTime(localOpening, parsed.timeZone);
}

export function isInsideWhatsAppCareWindow(lastInboundAt?: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) {
    return false;
  }

  return now.getTime() - lastInboundAt.getTime() <= WHATSAPP_CARE_WINDOW_HOURS * 60 * 60 * 1000;
}
