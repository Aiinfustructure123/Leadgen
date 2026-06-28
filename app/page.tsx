export default function Home() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-12">
      <main className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <section className="relative bg-gradient-to-br from-slate-950 via-indigo-900 to-violet-900 px-8 py-14 text-white">
          <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-cyan-400/25 blur-3xl" />
          <div className="absolute -bottom-16 left-16 h-52 w-52 rounded-full bg-purple-500/20 blur-3xl" />
          <p className="relative text-xs font-medium uppercase tracking-[0.25em] text-indigo-200">
            One Homes • AI Lead Concierge
          </p>
          <h1 className="relative mt-4 max-w-3xl text-4xl font-semibold tracking-tight">
            A premium sales operating system for high-intent property clients
          </h1>
          <p className="relative mt-4 max-w-2xl text-sm text-indigo-100">
            Instantly engage every enquiry, qualify intelligently across WhatsApp and email, and convert
            faster with structured notes, follow-up automation, and a live takeover dashboard.
          </p>
          <div className="relative mt-8 flex flex-wrap gap-3">
            <a
              href="/dashboard"
              className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Enter sales dashboard
            </a>
            <a
              href="/api/inngest"
              className="rounded-xl border border-white/30 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Inngest endpoint
            </a>
          </div>
        </section>

        <section className="grid gap-4 border-t border-slate-100 bg-slate-50 p-8 md:grid-cols-3">
          <FeatureCard
            title="Lead pipeline clarity"
            body="Search, filter and prioritise leads by status, activity and urgency in one fast interface."
          />
          <FeatureCard
            title="Notes + follow-ups"
            body="Capture sales context, objections and commitments with actionable follow-up scheduling."
          />
          <FeatureCard
            title="AI + human blend"
            body="Use AI for first-touch speed while preserving instant manual takeover for high-stakes conversations."
          />
        </section>
      </main>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </article>
  );
}
