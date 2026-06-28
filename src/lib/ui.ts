import type { LeadStatus } from "@/generated/prisma";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  VIEWING_BOOKED: "Viewing booked",
  HANDED_OFF: "Handed off",
  OPTED_OUT: "Opted out",
  DEAD: "Dead",
};

export const STATUS_STYLES: Record<LeadStatus, string> = {
  NEW: "bg-neutral-100 text-neutral-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  ENGAGED: "bg-indigo-100 text-indigo-700",
  QUALIFIED: "bg-violet-100 text-violet-700",
  VIEWING_BOOKED: "bg-green-100 text-green-700",
  HANDED_OFF: "bg-amber-100 text-amber-700",
  OPTED_OUT: "bg-red-100 text-red-700",
  DEAD: "bg-neutral-200 text-neutral-500",
};

export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
