import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { leadDisplayName } from "@/lib/leads";
import { STATUS_LABELS, STATUS_STYLES, timeAgo } from "@/lib/ui";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: {
      conversations: {
        select: { channel: true, handoff: true, _count: { select: { messages: true } } },
      },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Leads</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Live view of every enquiry and its conversation.
          </p>
        </div>
        <span className="text-sm text-neutral-500">{leads.length} shown</span>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center text-neutral-500">
          No leads yet. New Salesforce enquiries will appear here automatically.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Enquiry</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Qualification</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {leads.map((lead) => {
                const q = (lead.qualification as Record<string, unknown> | null) ?? {};
                const handoff = lead.conversations.some((c) => c.handoff);
                return (
                  <tr key={lead.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="font-medium text-neutral-900 hover:underline"
                      >
                        {leadDisplayName(lead)}
                      </Link>
                      <div className="text-xs text-neutral-500">{lead.phone ?? lead.email ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{lead.enquiryType ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[lead.status]}`}
                      >
                        {STATUS_LABELS[lead.status]}
                      </span>
                      {handoff ? (
                        <span className="ml-1 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          human
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {qualificationSnippet(q)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{timeAgo(lead.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function qualificationSnippet(q: Record<string, unknown>): string {
  const parts: string[] = [];
  if (q.budget) parts.push(`£${String(q.budget).replace(/^£/, "")}`);
  if (q.location) parts.push(String(q.location));
  if (q.beds) parts.push(`${q.beds} bed`);
  if (q.buyerType) parts.push(String(q.buyerType));
  return parts.length ? parts.join(" · ") : "—";
}
