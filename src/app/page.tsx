import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-8 py-24">
      <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
        One Homes AI Lead Concierge
      </h1>
      <p className="mt-4 max-w-3xl text-lg text-slate-600">
        Instant lead engagement across Salesforce, WhatsApp, and email with Claude-powered
        qualification and human handoff.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open dashboard
        </Link>
        <Link
          href="/api/inngest"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Inngest endpoint
        </Link>
      </div>
    </div>
  );
}
