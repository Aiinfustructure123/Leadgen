import { FollowUpPriority, FollowUpStatus, LeadStatus } from "@prisma/client";
import { formatISO } from "date-fns";
import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";

import {
  addFollowUp,
  addLeadNote,
  optOutLead,
  sendHumanMessage,
  takeOverConversation,
  updateLeadStatus,
  updateFollowUpStatus,
} from "../../actions";
import { ConversationPanel } from "./conversation-panel";

export const dynamic = "force-dynamic";

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

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      notes: {
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      },
      followUps: {
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      },
    },
  });

  if (!lead) {
    notFound();
  }

  const conversation = lead.conversations[0];
  const qualification = (lead.qualification as Record<string, string> | null) ?? {};
  const defaultFollowUpDueAt = formatISO(
    new Date(lead.lastActivityAt.getTime() + 24 * 60 * 60 * 1000),
    {
      representation: "complete",
    },
  ).slice(0, 16);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
            ← Back to leads
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">
            {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.phone || "Unnamed lead"}
          </h1>
          <p className="text-sm text-slate-500">{lead.enquiryType ?? "General enquiry"}</p>
          <p className="mt-1 text-xs text-slate-400">
            Last activity {lead.lastActivityAt.toLocaleString("en-GB", { hour12: false })}
          </p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ConversationPanel
          leadId={lead.id}
          initialMessages={
            conversation?.messages.map((message) => ({
              id: message.id,
              role: message.role,
              body: message.body,
              createdAt: message.createdAt.toISOString(),
            })) ?? []
          }
        />

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Qualification</h2>
            <dl className="mt-3 space-y-2 text-sm text-slate-600">
              <div>
                <dt className="font-medium">Budget</dt>
                <dd>{qualification.budget ?? "Not captured"}</dd>
              </div>
              <div>
                <dt className="font-medium">Location</dt>
                <dd>{qualification.location ?? "Not captured"}</dd>
              </div>
              <div>
                <dt className="font-medium">Bedrooms</dt>
                <dd>{qualification.beds ?? "Not captured"}</dd>
              </div>
              <div>
                <dt className="font-medium">Timeline</dt>
                <dd>{qualification.timeline ?? "Not captured"}</dd>
              </div>
              <div>
                <dt className="font-medium">Buyer type</dt>
                <dd>{qualification.buyerType ?? "Not captured"}</dd>
              </div>
              <div>
                <dt className="font-medium">Financing</dt>
                <dd>{qualification.financing ?? "Not captured"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Actions</h2>
            {conversation ? (
              <form action={takeOverConversation} className="mt-3">
                <input type="hidden" name="conversationId" value={conversation.id} />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600"
                >
                  Take over conversation
                </button>
              </form>
            ) : null}

            <form action={updateLeadStatus} className="mt-3 space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <label className="text-xs font-medium text-slate-500">Manual status override</label>
              <select
                name="status"
                defaultValue={lead.status}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Save status
              </button>
            </form>

            <form action={optOutLead} className="mt-3">
              <input type="hidden" name="leadId" value={lead.id} />
              <button
                type="submit"
                className="w-full rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
              >
                Mark opted out
              </button>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Sales notes</h2>
            <form action={addLeadNote} className="mt-3 space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <textarea
                name="body"
                required
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Capture objections, motivation, or context..."
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" name="pinned" className="rounded border-slate-300" />
                Pin this note
              </label>
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Save note
              </button>
            </form>
            <div className="mt-3 space-y-2">
              {lead.notes.map((note) => (
                <article key={note.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                    {note.pinned ? "Pinned · " : ""}
                    {note.createdAt.toLocaleString("en-GB", { hour12: false })}
                  </p>
                </article>
              ))}
              {lead.notes.length === 0 ? (
                <p className="text-xs text-slate-500">No notes yet for this lead.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-800">Follow-ups</h2>
            <form action={addFollowUp} className="mt-3 space-y-2">
              <input type="hidden" name="leadId" value={lead.id} />
              <input
                name="title"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Follow-up title (e.g. Send viewing options)"
              />
              <textarea
                name="notes"
                rows={2}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Optional context..."
              />
              <input
                type="datetime-local"
                name="dueAt"
                required
                defaultValue={defaultFollowUpDueAt}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <select
                name="priority"
                defaultValue={FollowUpPriority.MEDIUM}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.values(FollowUpPriority).map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Create follow-up
              </button>
            </form>
            <div className="mt-3 space-y-2">
              {lead.followUps.map((followUp) => (
                <article key={followUp.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{followUp.title}</p>
                      {followUp.notes ? (
                        <p className="mt-1 text-xs text-slate-600">{followUp.notes}</p>
                      ) : null}
                    </div>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${
                        followUp.priority === FollowUpPriority.HIGH
                          ? "bg-rose-100 text-rose-700"
                          : followUp.priority === FollowUpPriority.MEDIUM
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {followUp.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-400">
                    Due {followUp.dueAt.toLocaleString("en-GB", { hour12: false })}
                  </p>
                  <form action={updateFollowUpStatus} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="leadId" value={lead.id} />
                    <input type="hidden" name="followUpId" value={followUp.id} />
                    <select
                      name="status"
                      defaultValue={followUp.status}
                      className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-xs"
                    >
                      {Object.values(FollowUpStatus).map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      Update
                    </button>
                  </form>
                </article>
              ))}
              {lead.followUps.length === 0 ? (
                <p className="text-xs text-slate-500">No follow-ups scheduled yet.</p>
              ) : null}
            </div>
          </section>

          {conversation ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-800">Send manual message</h2>
              <form action={sendHumanMessage} className="mt-3 space-y-2">
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="conversationId" value={conversation.id} />
                <textarea
                  name="message"
                  required
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Type a WhatsApp message as consultant..."
                />
                <button
                  type="submit"
                  className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Send as human
                </button>
              </form>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <h2 className="text-sm font-semibold text-slate-800">Salesforce</h2>
            <p className="mt-2">Lead ID: {lead.salesforceId ?? "Not linked yet"}</p>
            {lead.salesforceId ? (
              <a
                className="mt-2 inline-flex text-sm font-medium text-indigo-600 hover:underline"
                href="#"
              >
                Open in Salesforce
              </a>
            ) : null}
          </section>
        </aside>
      </div>
    </main>
  );
}
