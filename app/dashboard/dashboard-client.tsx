"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LeadStatus } from "@prisma/client";

import { StatusBadge } from "@/components/status-badge";

type LeadRow = {
  id: string;
  name: string;
  enquiryType: string;
  status: LeadStatus;
  lastActivityAt: string;
  latestMessage: string;
  qualificationSummary: string;
  dueFollowUps: number;
  overdueFollowUps: number;
  notesCount: number;
};

type DashboardStats = {
  totalLeads: number;
  engagedLeads: number;
  viewingBooked: number;
  overdueFollowUps: number;
};

const STATUS_OPTIONS: Array<LeadStatus | "ALL"> = [
  "ALL",
  "NEW",
  "CONTACTED",
  "ENGAGED",
  "QUALIFIED",
  "VIEWING_BOOKED",
  "HANDED_OFF",
  "OPTED_OUT",
  "DEAD",
];

export function DashboardClient({
  leads,
  stats,
}: {
  leads: LeadRow[];
  stats: DashboardStats;
}) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "ALL">("ALL");

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const matchesStatus = statusFilter === "ALL" || lead.status === statusFilter;
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        lead.name.toLowerCase().includes(q) ||
        lead.enquiryType.toLowerCase().includes(q) ||
        lead.latestMessage.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [leads, search, statusFilter]);

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-900 to-indigo-900 p-6 text-white shadow-sm">
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-200">Sales command center</p>
        <h1 className="mt-2 text-3xl font-semibold">Prospective clients dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-indigo-100">
          Prioritise hot prospects, track follow-ups, and close faster with one unified workspace.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total leads" value={stats.totalLeads} accent="text-cyan-200" />
          <StatCard label="Engaged leads" value={stats.engagedLeads} accent="text-emerald-200" />
          <StatCard label="Viewings booked" value={stats.viewingBooked} accent="text-amber-200" />
          <StatCard label="Overdue follow-ups" value={stats.overdueFollowUps} accent="text-rose-200" />
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, enquiry, or message..."
            className="w-full rounded-xl border border-slate-300 px-4 py-2 text-sm outline-none ring-indigo-400 transition focus:ring md:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === status
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Lead</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last activity</th>
                <th className="px-4 py-3 font-medium">Pipeline notes</th>
                <th className="px-4 py-3 font-medium">Next action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/leads/${lead.id}`} className="font-medium text-slate-900 hover:underline">
                      {lead.name}
                    </Link>
                    <p className="text-xs text-slate-500">{lead.enquiryType}</p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {new Date(lead.lastActivityAt).toLocaleString("en-GB", { hour12: false })}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <p>{lead.qualificationSummary}</p>
                    <p className="mt-1 text-slate-400">{lead.latestMessage.slice(0, 90)}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {lead.overdueFollowUps > 0 ? (
                      <span className="inline-flex rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">
                        {lead.overdueFollowUps} overdue follow-up{lead.overdueFollowUps > 1 ? "s" : ""}
                      </span>
                    ) : lead.dueFollowUps > 0 ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 font-medium text-amber-700">
                        {lead.dueFollowUps} due today
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                        Up to date · {lead.notesCount} notes
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No leads match your filters yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
      <p className="text-xs text-indigo-100">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}
