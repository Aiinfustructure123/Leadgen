"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const statuses = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "VIEWING_BOOKED",
  "HANDED_OFF",
  "OPTED_OUT",
  "DEAD",
];

export function ConversationControls({
  conversationId,
  leadId,
  currentStatus,
}: {
  conversationId: string;
  leadId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Request failed.");
      }

      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold">Human controls</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
          onClick={() => post(`/api/dashboard/conversations/${conversationId}/take-over`)}
        >
          Take over
        </button>
        <button
          className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => post(`/api/dashboard/leads/${leadId}/opt-out`)}
        >
          Mark opted out
        </button>
      </div>

      <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="status">
        Manual status
      </label>
      <div className="mt-2 flex gap-2">
        <select
          id="status"
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          {statuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={busy}
          onClick={() => post(`/api/dashboard/leads/${leadId}/status`, { status })}
        >
          Save
        </button>
      </div>

      <label className="mt-5 block text-sm font-medium text-slate-700" htmlFor="reply">
        Send WhatsApp reply
      </label>
      <textarea
        id="reply"
        className="mt-2 min-h-28 w-full rounded-xl border border-stone-300 p-3 text-sm"
        placeholder="Type as the consultant..."
        value={message}
        onChange={(event) => setMessage(event.target.value)}
      />
      <button
        className="mt-3 rounded-full bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={busy || message.trim().length === 0}
        onClick={async () => {
          await post(`/api/dashboard/conversations/${conversationId}/send`, { body: message });
          setMessage("");
        }}
      >
        Send as human
      </button>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <p className="mt-3 text-xs text-slate-500">
        Free-form WhatsApp replies are allowed only inside the 24-hour customer-care window.
      </p>
    </div>
  );
}
