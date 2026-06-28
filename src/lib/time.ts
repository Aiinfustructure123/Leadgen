import { DateTime } from "luxon";

import { env } from "@/lib/config";

const STOP_KEYWORDS = new Set([
  "stop",
  "unsubscribe",
  "opt out",
  "opt-out",
  "remove me",
  "end",
  "cancel",
]);

export function normalizePhone(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("whatsapp:")
    ? trimmed.replace("whatsapp:", "")
    : trimmed;
}

export function shouldOptOut(message: string | null | undefined) {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase().trim();
  return STOP_KEYWORDS.has(normalized);
}

export function isWithin24hWindow(lastInboundAt: Date | null | undefined) {
  if (!lastInboundAt) {
    return false;
  }

  const now = Date.now();
  const lastInbound = lastInboundAt.getTime();
  const diff = now - lastInbound;
  const hours24 = 24 * 60 * 60 * 1000;
  return diff <= hours24;
}

type ContactHoursWindow = {
  start: string;
  end: string;
  zone: string;
};

export function parseContactHours(configValue = env.CONTACT_HOURS): ContactHoursWindow {
  const [window, maybeZone] = configValue.trim().split(" ");
  const [start, end] = window?.split("-") ?? [];

  if (!start || !end) {
    return { start: "08:00", end: "20:00", zone: env.CONTACT_TIMEZONE };
  }

  return {
    start,
    end,
    zone: maybeZone ?? env.CONTACT_TIMEZONE,
  };
}

export function isWithinContactHours(at = new Date(), configValue = env.CONTACT_HOURS) {
  const { start, end, zone } = parseContactHours(configValue);
  const now = DateTime.fromJSDate(at, { zone });
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);

  if (
    Number.isNaN(startHour) ||
    Number.isNaN(startMinute) ||
    Number.isNaN(endHour) ||
    Number.isNaN(endMinute)
  ) {
    return true;
  }

  const startTime = now.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const endTime = now.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });
  return now >= startTime && now <= endTime;
}

export function nextContactWindowStart(at = new Date(), configValue = env.CONTACT_HOURS) {
  const { start, zone } = parseContactHours(configValue);
  const [startHour, startMinute] = start.split(":").map(Number);
  const now = DateTime.fromJSDate(at, { zone });
  const todayStart = now.set({
    hour: startHour,
    minute: startMinute,
    second: 0,
    millisecond: 0,
  });

  return (now < todayStart ? todayStart : todayStart.plus({ days: 1 })).toJSDate();
}
