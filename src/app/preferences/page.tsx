import { prisma } from "@/lib/db";
import { BUSINESS } from "@/lib/config";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function optOutAction(formData: FormData) {
  "use server";
  const leadId = String(formData.get("leadId") ?? "");
  if (!leadId) return;
  await prisma.lead
    .update({
      where: { id: leadId },
      data: { optedOut: true, status: "OPTED_OUT" },
    })
    .catch(() => null);
  // Best-effort sync to Salesforce.
  const { inngest } = await import("@/lib/inngest/client");
  await inngest.send({ name: "lead/sync-salesforce", data: { leadId } }).catch(() => null);
  revalidatePath("/preferences");
}

export default async function PreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const { lead: leadId } = await searchParams;
  let optedOut = false;
  if (leadId) {
    const lead = await prisma.lead
      .findUnique({ where: { id: leadId } })
      .catch(() => null);
    optedOut = lead?.optedOut ?? false;
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white border border-black/5 rounded-xl p-8 text-center">
        <p className="text-brand-accent font-semibold uppercase text-xs tracking-wide">
          {BUSINESS.companyName}
        </p>
        <h1 className="mt-2 text-xl font-bold text-brand">
          Communication preferences
        </h1>
        {!leadId ? (
          <p className="mt-4 text-sm text-gray-500">
            We couldn&apos;t identify your record. Please use the link from your
            email.
          </p>
        ) : optedOut ? (
          <p className="mt-4 text-sm text-gray-600">
            You&apos;ve been unsubscribed. We won&apos;t contact you again. If
            this was a mistake, reply to any previous message and we&apos;ll be
            happy to help.
          </p>
        ) : (
          <form action={optOutAction} className="mt-6">
            <input type="hidden" name="leadId" value={leadId} />
            <p className="text-sm text-gray-600 mb-4">
              Click below to stop receiving messages from {BUSINESS.companyName}.
            </p>
            <button
              type="submit"
              className="bg-brand text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-light"
            >
              Unsubscribe from all messages
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
