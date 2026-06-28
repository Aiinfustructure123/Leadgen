"use client";

import { useTransition } from "react";
import type { LeadStatus } from "@prisma/client";
import {
  takeOver,
  resumeAi,
  setStatus,
  manualOptOut,
} from "@/app/dashboard/actions";

const STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "VIEWING_BOOKED",
  "HANDED_OFF",
  "OPTED_OUT",
  "DEAD",
];

export function LeadControls({
  leadId,
  handoff,
  status,
  optedOut,
}: {
  leadId: string;
  handoff: boolean;
  status: LeadStatus;
  optedOut: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!handoff ? (
        <button
          onClick={() => startTransition(() => takeOver(leadId))}
          disabled={pending || optedOut}
          className="bg-brand text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-light disabled:opacity-40"
        >
          Take over
        </button>
      ) : (
        <button
          onClick={() => startTransition(() => resumeAi(leadId))}
          disabled={pending || optedOut}
          className="bg-white border border-brand text-brand px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand/5 disabled:opacity-40"
        >
          Resume AI
        </button>
      )}

      <select
        value={status}
        onChange={(e) =>
          startTransition(() => setStatus(leadId, e.target.value as LeadStatus))
        }
        disabled={pending}
        className="border border-black/10 rounded-lg px-2 py-1.5 text-sm bg-white"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      {!optedOut && (
        <button
          onClick={() => {
            if (confirm("Opt this lead out of all messaging?")) {
              startTransition(() => manualOptOut(leadId));
            }
          }}
          disabled={pending}
          className="text-red-600 border border-red-200 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-40"
        >
          Opt out
        </button>
      )}
    </div>
  );
}
