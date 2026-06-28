import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

function formatDate(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function DashboardPage() {
  await auth.protect();

  const leads = await prisma.lead.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      conversations: {
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    take: 100,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Lead dashboard</h1>
      <p className="mt-2 text-sm text-slate-600">
        Monitor live conversations, qualification progress, and handoff status.
      </p>

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Qualification</th>
              <th className="px-4 py-3">Last activity</th>
              <th className="px-4 py-3">Channel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {leads.map((lead) => {
              const lastMessage = lead.conversations[0]?.messages[0];
              const qualification =
                lead.qualification && typeof lead.qualification === "object"
                  ? Object.entries(lead.qualification as Record<string, unknown>)
                      .slice(0, 3)
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(" · ")
                  : "Pending";

              return (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-slate-900">
                      {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.phone || lead.email || "Unknown lead"}
                    </Link>
                    <p className="text-xs text-slate-500">{lead.enquiryType ?? "No enquiry detail yet"}</p>
                  </td>
                  <td className="px-4 py-3">{lead.status}</td>
                  <td className="px-4 py-3 text-slate-600">{qualification}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDate(lastMessage?.createdAt ?? lead.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">WhatsApp + Email</td>
                </tr>
              );
            })}
            {!leads.length && (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                  No leads yet. Trigger Salesforce webhook to seed data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
