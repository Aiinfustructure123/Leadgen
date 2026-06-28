import { DateTime } from "luxon";

import { getContactHours } from "@/lib/config";

type ContactWindow = {
  startMinutes: number;
  endMinutes: number;
  timezone: string;
};

export function parseContactHours(raw = getContactHours()): ContactWindow {
  const [range, ...timezoneParts] = raw.trim().split(/\s+/);
  const timezone = timezoneParts.join(" ") || "Europe/London";
  const [start, end] = range.split("-");

  if (!start || !end) {
    throw new Error(`Invalid CONTACT_HOURS format: ${raw}`);
  }

  return {
    startMinutes: toMinutes(start),
    endMinutes: toMinutes(end),
    timezone,
  };
}

export function isInsideContactHours(date = new Date(), raw = getContactHours()): boolean {
  const window = parseContactHours(raw);
  const local = DateTime.fromJSDate(date, { zone: window.timezone });
  const minutes = local.hour * 60 + local.minute;

  if (window.startMinutes <= window.endMinutes) {
    return minutes >= window.startMinutes && minutes < window.endMinutes;
  }

  return minutes >= window.startMinutes || minutes < window.endMinutes;
}

export function nextContactWindowStart(date = new Date(), raw = getContactHours()): Date {
  const window = parseContactHours(raw);
  let local = DateTime.fromJSDate(date, { zone: window.timezone }).set({
    hour: Math.floor(window.startMinutes / 60),
    minute: window.startMinutes % 60,
    second: 0,
    millisecond: 0,
  });

  if (isInsideContactHours(date, raw)) {
    return date;
  }

  if (local <= DateTime.fromJSDate(date, { zone: window.timezone })) {
    local = local.plus({ days: 1 });
  }

  return local.toJSDate();
}

export function isInsideWhatsAppCareWindow(lastInboundAt?: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) {
    return false;
  }

  return now.getTime() - lastInboundAt.getTime() < 24 * 60 * 60 * 1000;
}

function toMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    throw new Error(`Invalid time in CONTACT_HOURS: ${value}`);
  }

  return hours * 60 + minutes;
}
