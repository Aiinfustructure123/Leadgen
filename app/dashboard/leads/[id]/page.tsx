import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/app/dashboard/auto-refresh";
import { LeadStatusForm, ManualMessageForm, TakeoverButton } from "@/app/dashboard/leads/[id]/lead-actions";
import { appConfig } from "@/lib/config";
import { formatQualification, leadDisplayName } from "@/lib/lead-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      conversations: {
        orderBy: { createdAt: "asc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  });

  if (!lead) {
    notFound();
  }

  const whatsappConversation = lead.conversations.find((conversation) => conversation.channel === "WHATSAPP");
  const allMessages = lead.conversations.flatMap((conversation) =>
    conversation.messages.map((message) => ({ ...message, channel: conversation.channel }))
  );
  const disabledManualSend = lead.optedOut || !lead.phone;

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <AutoRefresh />
      <Link href="/dashboard" className="text-sm text-stone-500 hover:text-stone-900">
        Back to leads
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-stone-950">{leadDisplayName(lead)}</h1>
          <p className="mt-2 text-stone-600">{lead.enquiryType ?? "No enquiry type recorded"}</p>
          <p className="mt-1 text-sm text-stone-500">
            {lead.phone ?? "No phone"} {lead.email ? `- ${lead.email}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
            {lead.status}
          </span>
          <TakeoverButton leadId={lead.id} disabled={Boolean(whatsappConversation?.handoff)} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <aside className="space-y-6">
          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-stone-950">Lead detail</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Detail label="Salesforce ID" value={lead.salesforceId ?? "Not linked"} />
              <Detail label="Property ref" value={lead.propertyRef ?? "Not provided"} />
              <Detail label="Source" value={lead.source ?? "Not provided"} />
              <Detail label="Consent source" value={lead.consentSource ?? "Not provided"} />
              <Detail label="Opted out" value={lead.optedOut ? "Yes" : "No"} />
              <Detail label="Last inbound" value={lead.lastInboundAt?.toLocaleString("en-GB") ?? "Never"} />
              <Detail label="Contact hours" value={appConfig.contactHours} />
            </dl>
          </div>

          <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-stone-950">Qualification</h2>
            <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-stone-50 p-4 text-xs leading-6 text-stone-700">
              {formatQualification(lead.qualification)}
            </pre>
          </div>

          <ManualMessageForm leadId={lead.id} disabled={disabledManualSend} />

          <LeadStatusForm leadId={lead.id} currentStatus={lead.status} optedOut={lead.optedOut} />
        </aside>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-950">Conversation transcript</h2>
            <span className="text-xs text-stone-500">{allMessages.length} messages</span>
          </div>
          <div className="mt-5 space-y-4">
            {allMessages.map((message) => (
              <div key={message.id} className="rounded-2xl border border-stone-100 bg-stone-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <span>
                    {message.channel} - {message.role}
                  </span>
                  <span>{message.createdAt.toLocaleString("en-GB")}</span>
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-800">{message.body}</p>
              </div>
            ))}
            {allMessages.length === 0 ? (
              <p className="rounded-2xl bg-stone-50 p-6 text-center text-sm text-stone-500">
                No conversation messages have been recorded yet.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-400">{label}</dt>
      <dd className="mt-1 text-stone-800">{value}</dd>
    </div>
  );
}
