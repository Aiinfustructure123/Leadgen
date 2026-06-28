"use client";

import { useState, useTransition } from "react";
import { sendHumanMessage } from "@/app/dashboard/actions";

export function Composer({
  leadId,
  disabled,
  hint,
}: {
  leadId: string;
  disabled?: boolean;
  hint?: string;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await sendHumanMessage(leadId, text);
      if (res.ok) {
        setBody("");
      } else {
        setError(
          res.error === "outside_window"
            ? "Outside the 24h WhatsApp window — only approved templates can be sent."
            : res.error === "opted-out"
              ? "This lead has opted out."
              : "Could not send message."
        );
      }
    });
  }

  return (
    <div className="border-t border-black/5 p-3 bg-white">
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      <div className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          placeholder={
            disabled
              ? "Click ‘Take over’ to message this lead directly"
              : "Type a message… (⌘/Ctrl+Enter to send)"
          }
          disabled={disabled || pending}
          rows={2}
          className="flex-1 resize-none rounded-lg border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={submit}
          disabled={disabled || pending || !body.trim()}
          className="bg-brand text-white px-4 rounded-lg text-sm font-medium hover:bg-brand-light disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
