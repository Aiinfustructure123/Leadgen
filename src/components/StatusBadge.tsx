import type { LeadStatus } from "@prisma/client";

const STYLES: Record<LeadStatus, string> = {
  NEW: "bg-gray-100 text-gray-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  ENGAGED: "bg-indigo-100 text-indigo-700",
  QUALIFIED: "bg-amber-100 text-amber-700",
  VIEWING_BOOKED: "bg-emerald-100 text-emerald-700",
  HANDED_OFF: "bg-purple-100 text-purple-700",
  OPTED_OUT: "bg-red-100 text-red-700",
  DEAD: "bg-gray-200 text-gray-500",
};

const LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  ENGAGED: "Engaged",
  QUALIFIED: "Qualified",
  VIEWING_BOOKED: "Viewing booked",
  HANDED_OFF: "Handed off",
  OPTED_OUT: "Opted out",
  DEAD: "Dead",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
