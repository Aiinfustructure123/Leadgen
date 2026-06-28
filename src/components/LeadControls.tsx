"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = [
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
  currentStatus,
  optedOut,
}: {
  leadId: string;
  currentStatus: string;
  optedOut: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [busy, setBusy] = useState(false);

  const update = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch(`/api/dashboard/leads/${leadId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">
          Status override
        </label>
        <div className="flex gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => update({ status })}
            disabled={busy || status === currentStatus}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>

      <button
        onClick={() => update({ optedOut: !optedOut })}
        disabled={busy}
        className={`w-full rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
          optedOut
            ? "border-green-300 bg-green-50 text-green-700"
            : "border-red-300 bg-red-50 text-red-700"
        }`}
      >
        {optedOut ? "Re-enable messaging" : "Mark opted out"}
      </button>
    </div>
  );
}
