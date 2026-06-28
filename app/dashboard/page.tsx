import Link from "next/link";

import { StatusBadge } from "@/components/status-badge";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { lastActivityAt: "desc" },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        take: 1,
      },
    },
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">Live leads dashboard</h1>
      <p className="mt-1 text-sm text-slate-500">
        Track active conversations and take over instantly when needed.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Lead</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">Qualification snapshot</th>
              <th className="px-4 py-3 font-medium">Latest message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const latest = lead.conversations[0]?.messages[0];
              const qualification = (lead.qualification as Record<string, string> | null) ?? {};
              return (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.phone || "Unnamed lead"}
                    </Link>
                    <p className="text-xs text-slate-500">{lead.enquiryType ?? "General enquiry"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.lastActivityAt.toLocaleString("en-GB", { hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {qualification.budget || qualification.location || qualification.timeline
                      ? `${qualification.budget ?? "Budget n/a"} · ${qualification.location ?? "Area n/a"} · ${qualification.timeline ?? "Timeline n/a"}`
                      : "No qualification captured yet"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {latest?.body ? latest.body.slice(0, 90) : "No messages yet"}
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No leads yet. Trigger /api/webhooks/salesforce to begin.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
