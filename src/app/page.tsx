import Link from "next/link";
import { BUSINESS } from "@/lib/config";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-2xl">
        <p className="text-brand-accent font-semibold tracking-wide uppercase text-sm">
          {BUSINESS.companyName}
        </p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-bold text-brand">
          AI Lead Concierge
        </h1>
        <p className="mt-5 text-lg text-gray-600 leading-relaxed">
          Every enquiry gets an instant, warm, intelligent first touch — over
          WhatsApp and email — so no lead goes cold while {BUSINESS.consultantName}{" "}
          is with other clients.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/dashboard"
            className="bg-brand text-white px-6 py-3 rounded-lg font-medium hover:bg-brand-light transition"
          >
            Open dashboard
          </Link>
          <a
            href="https://github.com"
            className="text-brand font-medium px-6 py-3 rounded-lg border border-brand/20 hover:bg-brand/5 transition"
          >
            Read the docs
          </a>
        </div>
        <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          {[
            {
              t: "Instant contact",
              d: "WhatsApp template + email within seconds of a new enquiry.",
            },
            {
              t: "Real conversation",
              d: "Claude qualifies the lead and books viewings, on brand.",
            },
            {
              t: "Human in the loop",
              d: "Take over any conversation; everything syncs to Salesforce.",
            },
          ].map((f) => (
            <div
              key={f.t}
              className="bg-white rounded-xl p-5 shadow-sm border border-black/5"
            >
              <h3 className="font-semibold text-brand">{f.t}</h3>
              <p className="mt-1 text-sm text-gray-600">{f.d}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
