import Link from "next/link";

import { AutoRefresh } from "@/app/dashboard/auto-refresh";
import { formatQualification, leadDisplayName } from "@/lib/lead-utils";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  return (
    <section className="mx-auto max-w-6xl px-6 py-10">
      <AutoRefresh />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">Live dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold text-stone-950">Leads</h1>
        </div>
        <p className="text-sm text-stone-500">Auto-refreshes every 10 seconds.</p>
      </div>

      <div className="mt-8 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-5 py-4">Lead</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Last activity</th>
              <th className="px-5 py-4">Channel</th>
              <th className="px-5 py-4">Qualification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {leads.map((lead) => {
              const latestMessage = lead.conversations
                .flatMap((conversation) => conversation.messages)
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
              const latestChannel = lead.conversations[0]?.channel ?? "WHATSAPP";

              return (
                <tr key={lead.id} className="align-top hover:bg-stone-50/80">
                  <td className="px-5 py-4">
                    <Link className="font-medium text-stone-950 hover:underline" href={`/dashboard/leads/${lead.id}`}>
                      {leadDisplayName(lead)}
                    </Link>
                    <div className="mt-1 text-xs text-stone-500">{lead.enquiryType ?? "No enquiry type"}</div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-stone-600">
                    {latestMessage ? (
                      <>
                        <div>{latestMessage.createdAt.toLocaleString("en-GB")}</div>
                        <div className="mt-1 max-w-xs truncate text-xs text-stone-500">{latestMessage.body}</div>
                      </>
                    ) : (
                      "No messages yet"
                    )}
                  </td>
                  <td className="px-5 py-4 text-stone-600">{latestChannel}</td>
                  <td className="whitespace-pre-line px-5 py-4 text-xs text-stone-600">
                    {formatQualification(lead.qualification)}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-center text-stone-500" colSpan={5}>
                  No leads yet. Send a signed Salesforce webhook to create the first one.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
