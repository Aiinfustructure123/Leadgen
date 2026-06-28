import Link from "next/link";

import { introTemplateCopy } from "@/lib/config";

export default function HomePage() {
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-amber-700">One Homes AI Lead Concierge</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tight text-stone-950 sm:text-6xl">
          Instant, warm lead engagement for every new enquiry.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
          Salesforce webhooks trigger approved WhatsApp templates, personalised email intros, Claude-powered
          qualification, Salesforce write-back, and a consultant takeover dashboard.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/dashboard" className="rounded-full bg-stone-950 px-5 py-3 text-sm font-medium text-white">
            Open dashboard
          </Link>
          <a
            href="/api/inngest"
            className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-900"
          >
            Inngest endpoint
          </a>
        </div>
      </div>
      <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-stone-950">WhatsApp intro template copy</h2>
        <p className="mt-4 rounded-2xl bg-stone-100 p-4 text-sm leading-6 text-stone-700">{introTemplateCopy}</p>
        <p className="mt-4 text-sm text-stone-500">
          Submit this copy for approval in Twilio/Meta, then place the approved SID in TWILIO_TEMPLATE_INTRO_SID.
        </p>
      </aside>
    </section>
  );
}
