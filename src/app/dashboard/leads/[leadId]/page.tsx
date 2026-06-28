"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Message {
  id: string;
  role: "LEAD" | "AI" | "HUMAN" | "SYSTEM";
  body: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

interface Conversation {
  id: string;
  channel: string;
  handoff: boolean;
  messages: Message[];
  createdAt: string;
}

interface Lead {
  id: string;
  salesforceId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  enquiryType: string | null;
  propertyRef: string | null;
  source: string | null;
  status: string;
  optedOut: boolean;
  qualification: Record<string, string> | null;
  lastInboundAt: string | null;
  conversations: Conversation[];
  updatedAt: string;
}

const ROLE_STYLES: Record<string, string> = {
  LEAD: "bg-white border border-stone-200 text-stone-800 self-start max-w-xs",
  AI: "bg-stone-900 text-white self-end max-w-xs",
  HUMAN: "bg-blue-600 text-white self-end max-w-xs",
  SYSTEM: "bg-stone-100 text-stone-400 self-center text-xs italic max-w-sm",
};

const ROLE_LABELS: Record<string, string> = {
  LEAD: "Lead",
  AI: "AI Concierge",
  HUMAN: "Consultant",
  SYSTEM: "System",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LeadDetailPage() {
  const { leadId } = useParams<{ leadId: string }>();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);
  const [humanMessage, setHumanMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchLead = async () => {
    const res = await fetch(`/api/leads/${leadId}`);
    if (res.ok) {
      const data = await res.json();
      setLead(data);
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function load() {
      const res = await fetch(`/api/leads/${leadId}`);
      if (res.ok && mounted) {
        const data = await res.json();
        setLead(data);
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [leadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lead?.conversations]);

  const activeConversation = lead?.conversations[0];

  const handleTakeover = async () => {
    if (!activeConversation) return;
    setTakingOver(true);
    await fetch(`/api/conversations/${activeConversation.id}/takeover`, {
      method: "POST",
    });
    await fetchLead();
    setTakingOver(false);
  };

  const handleSendMessage = async () => {
    if (!humanMessage.trim() || !activeConversation) return;
    setSending(true);
    await fetch(`/api/conversations/${activeConversation.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: humanMessage }),
    });
    setHumanMessage("");
    await fetchLead();
    setSending(false);
  };

  const handleStatusUpdate = async (newStatus: string) => {
    setStatusUpdating(true);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await fetchLead();
    setStatusUpdating(false);
  };

  const handleOptOut = async () => {
    if (!confirm("Mark this lead as opted out? This will halt all messaging.")) return;
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "OPTED_OUT", optedOut: true }),
    });
    await fetchLead();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="text-stone-400">Loading…</div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen">
        <div className="text-stone-400">Lead not found</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Conversation column */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-stone-200 px-6 py-4 flex items-center gap-4">
          <Link href="/dashboard" className="text-stone-400 hover:text-stone-600">
            ← Back
          </Link>
          <div className="flex-1">
            <h2 className="font-semibold text-stone-900">
              {lead.firstName} {lead.lastName}
            </h2>
            <p className="text-stone-400 text-xs">{lead.phone} · {lead.email}</p>
          </div>

          {activeConversation && !activeConversation.handoff && (
            <button
              onClick={handleTakeover}
              disabled={takingOver}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {takingOver ? "Taking over…" : "Take Over"}
            </button>
          )}

          {activeConversation?.handoff && (
            <span className="bg-yellow-100 text-yellow-700 px-3 py-1.5 rounded-lg text-xs font-medium">
              ● Human active
            </span>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-stone-50">
          {activeConversation ? (
            activeConversation.messages.map((msg) => (
              <div key={msg.id} className="flex flex-col">
                <div className={`rounded-2xl px-4 py-2.5 text-sm ${ROLE_STYLES[msg.role]}`}>
                  {msg.body}
                </div>
                <span
                  className={`text-xs text-stone-400 mt-1 ${
                    msg.role === "LEAD" ? "self-start" : "self-end"
                  }`}
                >
                  {ROLE_LABELS[msg.role]} · {timeAgo(msg.createdAt)}
                </span>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-stone-400 text-sm">No conversation yet</p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Human message input — only shown when handed off */}
        {activeConversation?.handoff && (
          <div className="bg-white border-t border-stone-200 p-4 flex gap-3">
            <input
              type="text"
              value={humanMessage}
              onChange={(e) => setHumanMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
              placeholder="Type a message to send via WhatsApp…"
              className="flex-1 bg-stone-100 rounded-lg px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-stone-900"
            />
            <button
              onClick={handleSendMessage}
              disabled={sending || !humanMessage.trim()}
              className="bg-stone-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        )}
      </div>

      {/* Lead detail sidebar */}
      <div className="w-80 bg-white border-l border-stone-200 overflow-y-auto p-6 space-y-6">
        {/* Status */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">Status</h3>
          <div className="space-y-2">
            <select
              value={lead.status}
              onChange={(e) => handleStatusUpdate(e.target.value)}
              disabled={statusUpdating}
              className="w-full bg-stone-100 rounded-lg px-3 py-2 text-sm text-stone-900 outline-none"
            >
              {["NEW", "CONTACTED", "ENGAGED", "QUALIFIED", "VIEWING_BOOKED", "HANDED_OFF", "OPTED_OUT", "DEAD"].map(
                (s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                )
              )}
            </select>

            {!lead.optedOut && (
              <button
                onClick={handleOptOut}
                className="w-full text-red-500 text-xs hover:text-red-700 py-1 text-left"
              >
                Mark as opted out
              </button>
            )}
            {lead.optedOut && (
              <p className="text-xs text-red-500">⛔ Lead opted out — messaging halted</p>
            )}
          </div>
        </section>

        {/* Contact info */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">Contact</h3>
          <dl className="space-y-1.5 text-sm">
            <div>
              <dt className="text-stone-400 text-xs">Email</dt>
              <dd className="text-stone-700">{lead.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-400 text-xs">Phone</dt>
              <dd className="text-stone-700">{lead.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-400 text-xs">Enquiry</dt>
              <dd className="text-stone-700">{lead.enquiryType ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-400 text-xs">Property Ref</dt>
              <dd className="text-stone-700">{lead.propertyRef ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-400 text-xs">Source</dt>
              <dd className="text-stone-700">{lead.source ?? "—"}</dd>
            </div>
            {lead.salesforceId && (
              <div>
                <dt className="text-stone-400 text-xs">Salesforce ID</dt>
                <dd className="text-stone-700 font-mono text-xs">{lead.salesforceId}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Qualification */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">
            Qualification
          </h3>
          {lead.qualification ? (
            <dl className="space-y-1.5 text-sm">
              {Object.entries(lead.qualification).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-stone-400 text-xs capitalize">{key.replace(/([A-Z])/g, " $1")}</dt>
                  <dd className="text-stone-700">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-stone-400 text-xs">No qualification data yet</p>
          )}
        </section>

        {/* Timeline */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-stone-400 font-medium mb-3">Timeline</h3>
          <dl className="space-y-1.5 text-xs text-stone-500">
            <div>
              <dt className="text-stone-400">Last inbound</dt>
              <dd>{lead.lastInboundAt ? timeAgo(lead.lastInboundAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-stone-400">Last updated</dt>
              <dd>{timeAgo(lead.updatedAt)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
