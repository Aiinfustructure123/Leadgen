import Link from "next/link";
import { clerkEnabled } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let UserButton: React.ComponentType<Record<string, unknown>> | null = null;
  if (clerkEnabled()) {
    const clerk = await import("@clerk/nextjs");
    UserButton = clerk.UserButton as unknown as React.ComponentType<
      Record<string, unknown>
    >;
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900">
              {config.consultant.company}
            </span>
            <span className="rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
              Concierge
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/dashboard" className="hover:text-neutral-900">
              Leads
            </Link>
            {UserButton ? <UserButton afterSignOutUrl="/" /> : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
