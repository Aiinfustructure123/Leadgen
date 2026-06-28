import Link from "next/link";
import { config } from "@/lib/config";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium tracking-wide text-neutral-600">
        {config.consultant.company} · AI Lead Concierge
      </span>
      <h1 className="text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl">
        Every enquiry gets an instant, intelligent first touch.
      </h1>
      <p className="mt-5 max-w-xl text-lg leading-relaxed text-neutral-600">
        The moment a lead lands in Salesforce, they receive a warm WhatsApp message
        and a personalised email — then hold a real, qualifying conversation powered
        by Claude, all logged back to your CRM.
      </p>
      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/dashboard"
          className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Open dashboard
        </Link>
        <a
          href="https://github.com"
          className="rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          Documentation
        </a>
      </div>
    </main>
  );
}
