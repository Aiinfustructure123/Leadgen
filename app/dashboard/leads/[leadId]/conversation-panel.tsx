"use client";

import { useEffect, useMemo, useState } from "react";

type Message = {
  id: string;
  role: "LEAD" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  createdAt: string;
};

type ConversationPayload = {
  conversation: {
    id: string;
    handoff: boolean;
    messages: Message[];
  } | null;
};

const ROLE_CLASS: Record<Message["role"], string> = {
  LEAD: "bg-white border border-slate-200 text-slate-900",
  AI: "bg-indigo-50 border border-indigo-100 text-indigo-900",
  HUMAN: "bg-emerald-50 border border-emerald-100 text-emerald-900",
  SYSTEM: "bg-slate-100 border border-slate-200 text-slate-700",
};

export function ConversationPanel({
  leadId,
  initialMessages,
}: {
  leadId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [handoff, setHandoff] = useState(false);

  useEffect(() => {
    let active = true;

    async function poll() {
      const response = await fetch(`/api/leads/${leadId}/conversation`, {
        cache: "no-store",
      });
      if (!response.ok || !active) {
        return;
      }
      const payload = (await response.json()) as ConversationPayload;
      setMessages(payload.conversation?.messages ?? []);
      setHandoff(Boolean(payload.conversation?.handoff));
    }

    poll().catch(() => undefined);
    const id = setInterval(() => {
      poll().catch(() => undefined);
    }, 5000);

    return () => {
      active = false;
      clearInterval(id);
    };
  }, [leadId]);

  const sorted = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [messages],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Conversation transcript</h2>
        <span className="text-xs text-slate-500">
          {handoff ? "Human takeover active" : "AI handling enabled"}
        </span>
      </div>
      <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
        {sorted.map((message) => (
          <div key={message.id} className={`rounded-lg p-3 text-sm ${ROLE_CLASS[message.role]}`}>
            <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wide opacity-70">
              <span>{message.role}</span>
              <span>{new Date(message.createdAt).toLocaleString("en-GB", { hour12: false })}</span>
            </div>
            <p className="whitespace-pre-wrap">{message.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
