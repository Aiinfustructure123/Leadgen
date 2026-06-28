import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-amber-700">Consultant dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Live lead conversations</h1>
        </div>
        <p className="text-sm text-slate-600">Showing the latest {leads.length} leads.</p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Lead</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4">Enquiry</th>
              <th className="px-5 py-4">Qualification</th>
              <th className="px-5 py-4">Last activity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {leads.map((lead) => {
              const latest = lead.conversations.flatMap((conversation) => conversation.messages)[0];

              return (
                <tr key={lead.id} className="hover:bg-stone-50">
                  <td className="px-5 py-4">
                    <a href={`/dashboard/leads/${lead.id}`} className="font-medium text-slate-950">
                      {lead.firstName || lead.lastName
                        ? `${lead.firstName ?? ""} ${lead.lastName ?? ""}`.trim()
                        : lead.phone || lead.email || "Unknown lead"}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">{lead.source || "Source unknown"}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{lead.enquiryType || lead.propertyRef || "-"}</td>
                  <td className="max-w-xs px-5 py-4 text-xs text-slate-600">
                    {lead.qualification ? JSON.stringify(lead.qualification) : "Not qualified yet"}
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    {latest ? latest.createdAt.toLocaleString("en-GB") : lead.updatedAt.toLocaleString("en-GB")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
