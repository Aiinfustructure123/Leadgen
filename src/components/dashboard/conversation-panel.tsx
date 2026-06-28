"use client";

import { useCallback, useEffect, useState } from "react";

type ConversationPayload = {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    status: string;
    qualification: unknown;
    optedOut: boolean;
    manualOverride: boolean;
    salesforceUrl: string | null;
  };
  conversation: {
    id: string;
    handoff: boolean;
    handoffReason: string | null;
    messages: Array<{
      id: string;
      role: string;
      body: string;
      createdAt: string;
    }>;
  } | null;
};

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ConversationPanel({ leadId }: { leadId: string }) {
  const [data, setData] = useState<ConversationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [manualBody, setManualBody] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ENGAGED");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/dashboard/leads/${leadId}/conversation`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Failed to load conversation");
    }
    const payload = (await response.json()) as ConversationPayload;
    setData(payload);
    setSelectedStatus(payload.lead.status);
  }, [leadId]);

  useEffect(() => {
    let active = true;

    const tick = async () => {
      try {
        await load();
        if (active) {
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    };

    void tick();
    const timer = setInterval(() => void tick(), 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load]);

  let qualificationSummary = "No qualification captured yet.";
  if (data?.lead.qualification && typeof data.lead.qualification === "object") {
    const items = Object.entries(data.lead.qualification as Record<string, unknown>);
    if (items.length) {
      qualificationSummary = items.map(([k, v]) => `${k}: ${String(v)}`).join(" · ");
    }
  }

  async function post(path: string, payload?: object) {
    const response = await fetch(path, {
      method: "POST",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    await load();
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Loading conversation...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!data) {
    return <p className="text-sm text-slate-500">Lead not found.</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">Live transcript</h2>
          <p className="mt-1 text-xs text-slate-500">
            Polling every 8 seconds. Manual takeover pauses AI replies.
          </p>
        </header>
        <div className="max-h-[520px] space-y-3 overflow-y-auto px-4 py-4">
          {data.conversation?.messages.map((message) => (
            <div
              key={message.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
            >
              <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                <span>{message.role}</span>
                <span>{formatTimestamp(message.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-slate-800">{message.body}</p>
            </div>
          ))}
          {!data.conversation?.messages.length && (
            <p className="text-sm text-slate-500">No messages yet.</p>
          )}
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Lead detail</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-slate-500">Name</dt>
              <dd>{data.lead.name || "Unknown"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Phone</dt>
              <dd>{data.lead.phone || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Email</dt>
              <dd>{data.lead.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>{data.lead.status}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Qualification</dt>
              <dd>{qualificationSummary}</dd>
            </div>
          </dl>
          {data.lead.salesforceUrl && (
            <a
              href={data.lead.salesforceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-sm font-medium text-blue-700 hover:underline"
            >
              Open Salesforce record
            </a>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Controls</h3>
          <div className="mt-3 space-y-2">
            <button
              onClick={() => void post(`/api/dashboard/leads/${leadId}/takeover`)}
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Take over
            </button>
            <button
              onClick={() => void post(`/api/dashboard/leads/${leadId}/optout`)}
              className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
            >
              Manual opt-out
            </button>
          </div>
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wide text-slate-500">Override status</label>
            <div className="mt-2 flex gap-2">
              <select
                className="w-full rounded-md border border-slate-300 px-2 py-2 text-sm"
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
              >
                {[
                  "NEW",
                  "CONTACTED",
                  "ENGAGED",
                  "QUALIFIED",
                  "VIEWING_BOOKED",
                  "HANDED_OFF",
                  "OPTED_OUT",
                  "DEAD",
                ].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <button
                onClick={() =>
                  void post(`/api/dashboard/leads/${leadId}/status`, {
                    status: selectedStatus,
                  })
                }
                className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold">Send manual message</h3>
          <textarea
            value={manualBody}
            onChange={(event) => setManualBody(event.target.value)}
            className="mt-2 min-h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            placeholder="Type a direct consultant reply..."
          />
          <button
            disabled={!manualBody.trim() || sending}
            onClick={async () => {
              try {
                setSending(true);
                await post(`/api/dashboard/leads/${leadId}/message`, { body: manualBody.trim() });
                setManualBody("");
              } finally {
                setSending(false);
              }
            }}
            className="mt-2 w-full rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </aside>
    </div>
  );
}
