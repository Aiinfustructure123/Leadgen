import Link from "next/link";
import { BUSINESS } from "@/lib/config";

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

async function UserButtonSlot() {
  if (!clerkConfigured) {
    return <span className="text-xs text-white/60">auth disabled (dev)</span>;
  }
  const { UserButton } = await import("@clerk/nextjs");
  return <UserButton afterSignOutUrl="/" />;
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand text-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="text-brand-accent font-bold tracking-wide">
              {BUSINESS.companyName}
            </span>
            <span className="text-white/70 text-sm">Lead Concierge</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-sm text-white/80 hover:text-white">
              Leads
            </Link>
            <UserButtonSlot />
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
