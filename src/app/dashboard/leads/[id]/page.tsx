import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { LeadControls } from "@/components/LeadControls";
import { Composer } from "@/components/Composer";
import { AutoRefresh } from "@/components/AutoRefresh";
import { qualificationSummary, type Qualification } from "@/lib/qualification";
import { isWithinWhatsAppWindow } from "@/lib/messaging";
import { BUSINESS } from "@/lib/config";
import type { Message, Role } from "@prisma/client";

export const dynamic = "force-dynamic";

const ROLE_STYLE: Record<Role, string> = {
  LEAD: "items-start",
  AI: "items-end",
  HUMAN: "items-end",
  SYSTEM: "items-center",
};

function bubbleClass(role: Role): string {
  switch (role) {
    case "LEAD":
      return "bg-white border border-black/10 text-gray-800";
    case "AI":
      return "bg-brand text-white";
    case "HUMAN":
      return "bg-brand-accent text-white";
    case "SYSTEM":
      return "bg-gray-100 text-gray-500 text-xs italic";
  }
}

function roleLabel(role: Role): string {
  switch (role) {
    case "LEAD":
      return "Lead";
    case "AI":
      return "AI assistant";
    case "HUMAN":
      return BUSINESS.consultantName;
    case "SYSTEM":
      return "System";
  }
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      conversations: {
        orderBy: { createdAt: "asc" },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  if (!lead) notFound();

  const messages: Message[] = lead.conversations.flatMap((c) => c.messages);
  const activeConversation = lead.conversations[lead.conversations.length - 1];
  const handoff = activeConversation?.handoff ?? false;
  const insideWindow = isWithinWhatsAppWindow(lead);
  const qual = lead.qualification as Qualification | null;

  const name =
    [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
    lead.phone ||
    "Unknown lead";

  return (
    <div>
      <AutoRefresh intervalMs={5000} />
      <Link href="/dashboard" className="text-sm text-brand hover:underline">
        ← Back to leads
      </Link>

      <div className="mt-3 flex flex-col lg:flex-row gap-6">
        {/* Conversation */}
        <div className="flex-1 bg-white border border-black/5 rounded-xl flex flex-col min-h-[60vh]">
          <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-brand">{name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={lead.status} />
                {handoff && (
                  <span className="text-xs text-purple-600 font-medium">
                    Human in control
                  </span>
                )}
                <span
                  className={`text-xs ${insideWindow ? "text-emerald-600" : "text-gray-400"}`}
                >
                  {insideWindow ? "● within 24h window" : "○ outside 24h window"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {messages.length === 0 && (
              <p className="text-center text-gray-400 text-sm">
                No messages yet.
              </p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${ROLE_STYLE[m.role]}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${bubbleClass(m.role)}`}
                >
                  {m.role !== "SYSTEM" && (
                    <div className="text-[10px] opacity-70 mb-0.5">
                      {roleLabel(m.role)}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                </div>
                <span className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(m.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <Composer
            leadId={lead.id}
            disabled={!handoff || lead.optedOut}
            hint={
              lead.optedOut
                ? "Lead has opted out — messaging disabled."
                : !handoff
                  ? "AI is handling this conversation. Click ‘Take over’ to message directly."
                  : !insideWindow
                    ? "Outside the 24h window — only approved templates may be sent."
                    : undefined
            }
          />
        </div>

        {/* Detail panel */}
        <aside className="w-full lg:w-80 space-y-4">
          <div className="bg-white border border-black/5 rounded-xl p-5">
            <h2 className="font-semibold text-brand mb-3">Controls</h2>
            <LeadControls
              leadId={lead.id}
              handoff={handoff}
              status={lead.status}
              optedOut={lead.optedOut}
            />
          </div>

          <div className="bg-white border border-black/5 rounded-xl p-5">
            <h2 className="font-semibold text-brand mb-3">Qualification</h2>
            {qual ? (
              <dl className="space-y-1.5 text-sm">
                {Object.entries(qual).map(([k, v]) =>
                  v === undefined || v === null || v === "" ? null : (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-gray-500 capitalize">{k}</dt>
                      <dd className="text-gray-800 text-right">{String(v)}</dd>
                    </div>
                  )
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-400">
                {qualificationSummary(qual)}
              </p>
            )}
          </div>

          <div className="bg-white border border-black/5 rounded-xl p-5">
            <h2 className="font-semibold text-brand mb-3">Details</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label="Email" value={lead.email} />
              <Row label="Phone" value={lead.phone} />
              <Row label="Enquiry" value={lead.enquiryType} />
              <Row label="Property ref" value={lead.propertyRef} />
              <Row label="Source" value={lead.source} />
              <Row
                label="Opted out"
                value={lead.optedOut ? "Yes" : "No"}
              />
              {lead.salesforceId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Salesforce</dt>
                  <dd className="text-right">
                    <span className="text-gray-800">{lead.salesforceId}</span>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-800 text-right break-all">{value || "—"}</dd>
    </div>
  );
}
