import { FollowUpStatus, LeadStatus } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";

import { DashboardClient } from "@/app/dashboard/dashboard-client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const leads = await prisma.lead.findMany({
    orderBy: { lastActivityAt: "desc" },
    include: {
      conversations: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        take: 1,
      },
      notes: {
        select: { id: true },
      },
      followUps: {
        where: {
          status: FollowUpStatus.PENDING,
        },
        select: {
          dueAt: true,
          status: true,
        },
      },
    },
  });

  const engagedStatuses = new Set<LeadStatus>([
    LeadStatus.ENGAGED,
    LeadStatus.QUALIFIED,
    LeadStatus.VIEWING_BOOKED,
  ]);

  const totalLeads = leads.length;
  const engagedLeads = leads.filter((lead) => engagedStatuses.has(lead.status)).length;
  const viewingBooked = leads.filter((lead) => lead.status === LeadStatus.VIEWING_BOOKED).length;

  const rows = leads.map((lead) => {
    const latest = lead.conversations[0]?.messages[0];
    const qualification = (lead.qualification as Record<string, string> | null) ?? {};
    const dueFollowUps = lead.followUps.filter((followUp) => {
      return followUp.dueAt >= todayStart && followUp.dueAt <= todayEnd;
    }).length;
    const overdueFollowUps = lead.followUps.filter((followUp) => followUp.dueAt < todayStart).length;

    return {
      id: lead.id,
      name:
        [lead.firstName, lead.lastName].filter(Boolean).join(" ") ||
        lead.phone ||
        "Unnamed lead",
      enquiryType: lead.enquiryType ?? "General enquiry",
      status: lead.status,
      lastActivityAt: lead.lastActivityAt.toISOString(),
      latestMessage: latest?.body ?? "No messages yet",
      qualificationSummary:
        qualification.budget || qualification.location || qualification.timeline
          ? `${qualification.budget ?? "Budget n/a"} · ${qualification.location ?? "Area n/a"} · ${
              qualification.timeline ?? "Timeline n/a"
            }`
          : "No qualification captured yet",
      dueFollowUps,
      overdueFollowUps,
      notesCount: lead.notes.length,
    };
  });

  const overdueFollowUps = rows.reduce((count, row) => count + row.overdueFollowUps, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      <DashboardClient
        leads={rows}
        stats={{ totalLeads, engagedLeads, viewingBooked, overdueFollowUps }}
      />
    </main>
  );
}
