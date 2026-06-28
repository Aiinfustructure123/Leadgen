const milestones = [
  "Salesforce HMAC webhook stores and dedupes new enquiries.",
  "Inngest fans out WhatsApp template and personalised email.",
  "Twilio inbound replies trigger a Claude tool-use agent.",
  "Salesforce write-back records transcript summaries and qualification.",
  "Clerk-protected dashboard supports monitoring and human takeover.",
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <section className="rounded-3xl bg-slate-950 p-10 text-white shadow-xl">
        <p className="text-sm uppercase tracking-[0.25em] text-amber-200">One Homes</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          AI lead concierge for instant WhatsApp and email engagement.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-200">
          New Salesforce enquiries are acknowledged within seconds, qualified over WhatsApp by Claude,
          and synced back to Salesforce with the full outcome.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a className="rounded-full bg-white px-5 py-3 font-medium text-slate-950" href="/dashboard">
            Open dashboard
          </a>
          <a className="rounded-full border border-white/30 px-5 py-3 font-medium" href="/api/inngest">
            Inngest endpoint
          </a>
        </div>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {milestones.map((milestone) => (
          <div key={milestone} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-amber-700">Built-in milestone</p>
            <p className="mt-2 text-slate-800">{milestone}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
