import { addDays, set } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { BUSINESS_CONFIG } from "@/lib/config";

function parseContactHours() {
  const [hoursPart, timeZone = "Europe/London"] = BUSINESS_CONFIG.contactHours.split(" ");
  const [start = "08:00", end = "20:00"] = hoursPart.split("-");
  const [startHour, startMinute] = start.split(":").map((item) => Number(item));
  const [endHour, endMinute] = end.split(":").map((item) => Number(item));

  return {
    timeZone,
    startHour,
    startMinute,
    endHour,
    endMinute,
  };
}

export function isWithinContactHours(date = new Date()): boolean {
  const { timeZone, startHour, startMinute, endHour, endMinute } = parseContactHours();
  const zoned = toZonedTime(date, timeZone);
  const minutes = zoned.getHours() * 60 + zoned.getMinutes();
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  return minutes >= start && minutes <= end;
}

export function nextAllowedContactDate(date = new Date()): Date {
  const { timeZone, startHour, startMinute, endHour, endMinute } = parseContactHours();
  const zoned = toZonedTime(date, timeZone);
  const startToday = set(zoned, {
    hours: startHour,
    minutes: startMinute,
    seconds: 0,
    milliseconds: 0,
  });
  const endToday = set(zoned, {
    hours: endHour,
    minutes: endMinute,
    seconds: 0,
    milliseconds: 0,
  });

  if (zoned < startToday) {
    return fromZonedTime(startToday, timeZone);
  }
  if (zoned > endToday) {
    return fromZonedTime(addDays(startToday, 1), timeZone);
  }
  return date;
}

export function isWithinCustomerCareWindow(lastInboundAt?: Date | null): boolean {
  if (!lastInboundAt) {
    return false;
  }
  const deltaMs = Date.now() - lastInboundAt.getTime();
  return deltaMs <= 24 * 60 * 60 * 1000;
}
