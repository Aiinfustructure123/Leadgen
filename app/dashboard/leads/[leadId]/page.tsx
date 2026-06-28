import { notFound } from "next/navigation";

import { ConversationControls } from "@/components/dashboard/ConversationControls";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      conversations: {
        orderBy: { updatedAt: "desc" },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      },
    },
  });

  if (!lead) {
    notFound();
  }

  const whatsAppConversation =
    lead.conversations.find((conversation) => conversation.channel === "WHATSAPP") ||
    lead.conversations[0];

  return (
    <main className="mx-auto grid max-w-6xl gap-6 px-6 py-10 lg:grid-cols-[1fr_340px]">
      <section>
        <a href="/dashboard" className="text-sm text-slate-600">
          Back to dashboard
        </a>
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-amber-700">Lead detail</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {lead.firstName || lead.lastName
                  ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                  : lead.phone || lead.email || "Unknown lead"}
              </h1>
              <p className="mt-2 text-slate-600">{lead.enquiryType || "No enquiry type recorded"}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {lead.status}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
            <Detail label="Phone" value={lead.phone} />
            <Detail label="Email" value={lead.email} />
            <Detail label="Salesforce ID" value={lead.salesforceId} />
            <Detail label="Property ref" value={lead.propertyRef} />
            <Detail label="Source" value={lead.source} />
            <Detail label="Consent source" value={lead.consentSource} />
          </dl>
        </div>

        <div className="mt-6 space-y-6">
          {lead.conversations.map((conversation) => (
            <article key={conversation.id} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{conversation.channel} transcript</h2>
                {conversation.handoff ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    Human takeover active
                  </span>
                ) : null}
              </div>
              <div className="mt-5 space-y-3">
                {conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      message.role === "LEAD"
                        ? "bg-stone-100"
                        : message.role === "SYSTEM"
                          ? "bg-slate-50 text-slate-500"
                          : "bg-slate-950 text-white"
                    }`}
                  >
                    <div className="mb-1 flex justify-between gap-3 text-xs opacity-70">
                      <span>{message.role}</span>
                      <span>{message.createdAt.toLocaleString("en-GB")}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{message.body}</p>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="space-y-6">
        {whatsAppConversation ? (
          <ConversationControls
            conversationId={whatsAppConversation.id}
            leadId={lead.id}
            currentStatus={lead.status}
          />
        ) : null}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Qualification</h2>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs text-slate-700">
            {lead.qualification ? JSON.stringify(lead.qualification, null, 2) : "No qualification captured yet."}
          </pre>
        </div>
      </aside>
    </main>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-800">{value || "-"}</dd>
    </div>
  );
}
