"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ApiMessage {
  id: string;
  role: "LEAD" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  channel: "WHATSAPP" | "EMAIL";
  createdAt: string;
}

interface PanelState {
  status: string;
  handoff: boolean;
  optedOut: boolean;
  messages: ApiMessage[];
}

export function ConversationPanel({ leadId }: { leadId: string }) {
  const [state, setState] = useState<PanelState | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/messages`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = (await res.json()) as PanelState;
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [leadId]);

  // Poll for realtime-ish updates. `load` is async so any setState happens in a
  // later microtask, not synchronously within the effect.
  useEffect(() => {
    let active = true;
    const tick = () => {
      if (active) void load();
    };
    const interval = setInterval(tick, 4000);
    tick();
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [load]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [state?.messages.length]);

  const toggleTakeover = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/takeover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handoff: !state?.handoff }),
      });
      if (!res.ok) throw new Error("Take-over failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Take-over failed");
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${leadId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json()) as { delivery?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      if (data.delivery === "window-closed") {
        setError("Saved, but not delivered: outside the 24h WhatsApp window.");
      }
      setDraft("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-neutral-900">Conversation</span>
          {state?.handoff ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
              Human handling
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              AI active
            </span>
          )}
        </div>
        <button
          onClick={toggleTakeover}
          disabled={busy}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
        >
          {state?.handoff ? "Return to AI" : "Take over"}
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {!state ? (
          <p className="text-sm text-neutral-400">Loading…</p>
        ) : state.messages.length === 0 ? (
          <p className="text-sm text-neutral-400">No messages yet.</p>
        ) : (
          state.messages.map((m) => <Bubble key={m.id} message={m} />)
        )}
      </div>

      <div className="border-t border-neutral-200 p-3">
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
            }}
            placeholder={
              state?.handoff
                ? "Type a message to the lead…"
                : "Take over to message directly, or send while AI is active…"
            }
            rows={2}
            className="flex-1 resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !draft.trim()}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">⌘/Ctrl + Enter to send</p>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ApiMessage }) {
  if (message.role === "SYSTEM") {
    return (
      <div className="text-center">
        <span className="inline-block rounded-full bg-neutral-100 px-3 py-1 text-[11px] text-neutral-500">
          {message.body}
        </span>
      </div>
    );
  }
  const isLead = message.role === "LEAD";
  const align = isLead ? "items-start" : "items-end";
  const styles = isLead
    ? "bg-neutral-100 text-neutral-900"
    : message.role === "HUMAN"
      ? "bg-amber-500 text-white"
      : "bg-neutral-900 text-white";
  const label = isLead ? "Lead" : message.role === "HUMAN" ? "Consultant" : "AI";
  return (
    <div className={`flex flex-col ${align}`}>
      <span className="mb-1 text-[11px] text-neutral-400">{label}</span>
      <div className={`max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${styles}`}>
        {message.body}
      </div>
      <span className="mt-1 text-[10px] text-neutral-400">
        {new Date(message.createdAt).toLocaleString()}
      </span>
    </div>
  );
}
