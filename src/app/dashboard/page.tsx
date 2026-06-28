"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
type LeadStatus = "NEW" | "CONTACTED" | "ENGAGED" | "QUALIFIED" | "VIEWING_BOOKED" | "HANDED_OFF" | "OPTED_OUT" | "DEAD";

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  enquiryType: string | null;
  status: LeadStatus;
  optedOut: boolean;
  qualification: Record<string, string> | null;
  lastInboundAt: string | null;
  updatedAt: string;
  conversations: Array<{
    id: string;
    handoff: boolean;
    messages: Array<{
      role: string;
      body: string;
      createdAt: string;
    }>;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  CONTACTED: "bg-indigo-100 text-indigo-700",
  ENGAGED: "bg-green-100 text-green-700",
  QUALIFIED: "bg-teal-100 text-teal-700",
  VIEWING_BOOKED: "bg-purple-100 text-purple-700",
  HANDED_OFF: "bg-yellow-100 text-yellow-700",
  OPTED_OUT: "bg-stone-100 text-stone-500",
  DEAD: "bg-red-100 text-red-500",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");

  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Fetch data on mount and on filter change; poll for live updates
    let mounted = true;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (status) params.set("status", status);
      const res = await fetch(`/api/leads?${params}`);
      const data = await res.json();
      if (mounted) {
        setLeads(data.leads ?? []);
        setTotal(data.total ?? 0);
        setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [status, page]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">
            {status ? `${status.replace(/_/g, " ")} Leads` : "All Leads"}
          </h1>
          <p className="text-stone-500 text-sm mt-1">{total} total</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400">Auto-refreshes every 10s</span>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        </div>
      </div>

      {loading && leads.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-stone-400">Loading…</div>
        </div>
      ) : leads.length === 0 ? (
        <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-stone-200">
          <div className="text-center">
            <p className="text-stone-400 text-sm">No leads found</p>
            <p className="text-stone-300 text-xs mt-1">
              Leads will appear here when enquiries arrive from Salesforce
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                  Lead
                </th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                  Enquiry
                </th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                  Qualification
                </th>
                <th className="text-left px-4 py-3 text-stone-500 font-medium text-xs uppercase tracking-wide">
                  Last Activity
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {leads.map((lead) => {
                const lastMsg = lead.conversations[0]?.messages[0];
                return (
                  <tr key={lead.id} className="hover:bg-stone-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-900">
                        {lead.firstName} {lead.lastName}
                      </div>
                      <div className="text-stone-400 text-xs">{lead.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-stone-700">{lead.enquiryType ?? "—"}</div>
                      {lead.conversations[0]?.handoff && (
                        <span className="text-xs text-yellow-600 font-medium">● Human active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[lead.status] ?? "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {lead.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lead.qualification ? (
                        <div className="text-xs text-stone-500 space-y-0.5">
                          {lead.qualification.budget && (
                            <div>Budget: {lead.qualification.budget}</div>
                          )}
                          {lead.qualification.beds && (
                            <div>Beds: {lead.qualification.beds}</div>
                          )}
                          {lead.qualification.timeline && (
                            <div>Timeline: {lead.qualification.timeline}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-stone-300 text-xs">Not yet qualified</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-stone-400 text-xs">
                      {lastMsg ? timeAgo(lastMsg.createdAt) : timeAgo(lead.updatedAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/leads/${lead.id}`}
                        className="text-stone-900 text-xs font-medium hover:underline"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs text-stone-600 hover:text-stone-900 disabled:text-stone-300"
              >
                ← Previous
              </button>
              <span className="text-xs text-stone-400">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="text-xs text-stone-600 hover:text-stone-900 disabled:text-stone-300"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-stone-400">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
