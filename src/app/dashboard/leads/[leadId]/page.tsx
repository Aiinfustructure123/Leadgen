import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { ConversationPanel } from "@/components/dashboard/conversation-panel";

type Params = Promise<{ leadId: string }>;

export default async function LeadDetailPage({ params }: { params: Params }) {
  await auth.protect();
  const { leadId } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversation detail</h1>
          <p className="text-sm text-slate-600">Lead ID: {leadId}</p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-slate-700 hover:underline">
          Back to leads
        </Link>
      </div>

      <ConversationPanel leadId={leadId} />
    </div>
  );
}
