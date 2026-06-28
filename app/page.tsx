export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-6 py-20">
      <main className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          One Homes
        </p>
        <h1 className="mt-3 text-3xl font-semibold text-slate-900">
          AI Lead Concierge
        </h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          This workspace runs the Salesforce → Inngest → WhatsApp/Email → Claude
          lead engagement pipeline and a live dashboard for consultant handoff.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/dashboard"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            Open dashboard
          </a>
          <a
            href="/api/inngest"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Inngest endpoint
          </a>
        </div>
      </main>
    </div>
  );
}
