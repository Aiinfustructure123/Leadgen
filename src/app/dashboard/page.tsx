import Link from "next/link";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/StatusBadge";
import { qualificationSummary, type Qualification } from "@/lib/qualification";

export const dynamic = "force-dynamic";

function timeAgo(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function LeadsPage() {
  let leads: Awaited<ReturnType<typeof loadLeads>> = [];
  let dbError = false;
  try {
    leads = await loadLeads();
  } catch {
    dbError = true;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-brand">Leads</h1>
          <p className="text-sm text-gray-500">
            Live view of every enquiry and conversation.
          </p>
        </div>
      </div>

      {dbError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-4 text-sm">
          Could not reach the database. Check <code>DATABASE_URL</code> and run{" "}
          <code>npx prisma migrate deploy</code>.
        </div>
      )}

      {!dbError && leads.length === 0 && (
        <div className="bg-white border border-black/5 rounded-xl p-10 text-center text-gray-500">
          No leads yet. New enquiries from Salesforce will appear here.
        </div>
      )}

      {!dbError && leads.length > 0 && (
        <div className="bg-white border border-black/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Enquiry</th>
                <th className="px-4 py-3 font-medium">Qualification</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-t border-black/5 hover:bg-gray-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/leads/${lead.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
                        lead.phone ||
                        "Unknown"}
                    </Link>
                    <div className="text-xs text-gray-400">{lead.phone ?? lead.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                    {lead.optedOut && (
                      <span className="ml-1 text-xs text-red-500">opted out</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {lead.enquiryType ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs max-w-xs truncate">
                    {qualificationSummary(lead.qualification as Qualification | null)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {timeAgo(lead.lastInboundAt ?? lead.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function loadLeads() {
  return prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}
