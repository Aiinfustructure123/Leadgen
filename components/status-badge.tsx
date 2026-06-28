import { LeadStatus } from "@prisma/client";

const STATUS_CLASS: Record<LeadStatus, string> = {
  NEW: "bg-slate-100 text-slate-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  ENGAGED: "bg-blue-100 text-blue-700",
  QUALIFIED: "bg-emerald-100 text-emerald-700",
  VIEWING_BOOKED: "bg-green-100 text-green-700",
  HANDED_OFF: "bg-amber-100 text-amber-700",
  OPTED_OUT: "bg-rose-100 text-rose-700",
  DEAD: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {status}
    </span>
  );
}
