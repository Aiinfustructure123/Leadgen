import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { leadDisplayName } from "@/lib/leads";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/ui";
import { ConversationPanel } from "@/components/ConversationPanel";
import { LeadControls } from "@/components/LeadControls";

export const dynamic = "force-dynamic";

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) notFound();

  const q = (lead.qualification as Record<string, unknown> | null) ?? {};
  const sfBase = process.env.SF_LOGIN_URL?.replace(/\/$/, "");
  const sfLink =
    lead.salesforceId && sfBase ? `${sfBase}/${lead.salesforceId}` : null;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-neutral-500 hover:underline">
            ← All leads
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
            {leadDisplayName(lead)}
          </h1>
          <p className="text-sm text-neutral-500">
            {lead.phone ?? "no phone"} · {lead.email ?? "no email"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[lead.status]}`}
        >
          {STATUS_LABELS[lead.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ConversationPanel leadId={lead.id} />
        </div>

        <div className="space-y-5">
          <Card title="Enquiry">
            <Row label="Type" value={lead.enquiryType} />
            <Row label="Property ref" value={lead.propertyRef} />
            <Row label="Source" value={lead.source} />
            {sfLink ? (
              <div className="pt-1">
                <a
                  href={sfLink}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Open in Salesforce →
                </a>
              </div>
            ) : null}
          </Card>

          <Card title="Qualification">
            {Object.keys(q).length === 0 ? (
              <p className="text-sm text-neutral-400">Nothing captured yet.</p>
            ) : (
              <div className="space-y-1">
                {Object.entries(q).map(([k, v]) => (
                  <Row key={k} label={prettyKey(k)} value={String(v)} />
                ))}
              </div>
            )}
          </Card>

          <Card title="Controls">
            <LeadControls
              leadId={lead.id}
              currentStatus={lead.status}
              optedOut={lead.optedOut}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-800">{value || "—"}</span>
    </div>
  );
}

function prettyKey(k: string): string {
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
