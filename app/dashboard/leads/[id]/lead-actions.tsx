"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function TakeoverButton({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function takeOver() {
    setLoading(true);
    await fetch(`/api/leads/${leadId}/takeover`, { method: "POST" });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={takeOver}
      className="rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
    >
      {loading ? "Taking over..." : disabled ? "AI paused" : "Take over"}
    </button>
  );
}

export function ManualMessageForm({ leadId, disabled }: { leadId: string; disabled?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/leads/${leadId}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not send message.");
    } else {
      setBody("");
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <label htmlFor="manual-message" className="text-sm font-medium text-stone-900">
        Manual WhatsApp reply
      </label>
      <textarea
        id="manual-message"
        rows={4}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        disabled={disabled || loading}
        className="mt-3 w-full rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-stone-400"
        placeholder="Type a message as the consultant..."
      />
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={disabled || loading || body.trim().length === 0}
        className="mt-3 rounded-full bg-amber-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {loading ? "Sending..." : "Send as human"}
      </button>
    </form>
  );
}

const statuses = [
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "VIEWING_BOOKED",
  "HANDED_OFF",
  "OPTED_OUT",
  "DEAD"
];

export function LeadStatusForm({
  leadId,
  currentStatus,
  optedOut
}: {
  leadId: string;
  currentStatus: string;
  optedOut: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [isOptedOut, setIsOptedOut] = useState(optedOut);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch(`/api/leads/${leadId}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, optedOut: isOptedOut })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not update status.");
    } else {
      router.refresh();
    }

    setLoading(false);
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-stone-950">Manual controls</h2>
      <label htmlFor="status" className="mt-4 block text-sm font-medium text-stone-900">
        Status
      </label>
      <select
        id="status"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
        className="mt-2 w-full rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm outline-none focus:border-stone-400"
      >
        {statuses.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <label className="mt-4 flex items-center gap-2 text-sm text-stone-700">
        <input
          type="checkbox"
          checked={isOptedOut}
          onChange={(event) => setIsOptedOut(event.target.checked)}
          className="h-4 w-4"
        />
        Mark lead as opted out and pause AI
      </label>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="mt-4 rounded-full bg-stone-950 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-stone-300"
      >
        {loading ? "Saving..." : "Save controls"}
      </button>
    </form>
  );
}
