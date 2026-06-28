import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { CONSULTANT_NAME } from "@/lib/config";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-stone-900 flex flex-col">
        <div className="p-6 border-b border-stone-700">
          <h1 className="text-white font-bold text-lg tracking-tight">One Homes</h1>
          <p className="text-stone-400 text-xs mt-1">AI Concierge Dashboard</p>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            All Leads
          </Link>

          <Link
            href="/dashboard?status=NEW"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 ml-1" />
            New
          </Link>

          <Link
            href="/dashboard?status=ENGAGED"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-green-400 ml-1" />
            Engaged
          </Link>

          <Link
            href="/dashboard?status=HANDED_OFF"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-yellow-400 ml-1" />
            Handed Off
          </Link>

          <Link
            href="/dashboard?status=VIEWING_BOOKED"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-300 hover:text-white hover:bg-stone-800 transition-colors text-sm font-medium"
          >
            <span className="w-2 h-2 rounded-full bg-purple-400 ml-1" />
            Viewing Booked
          </Link>
        </nav>

        <div className="p-4 border-t border-stone-700 flex items-center gap-3">
          <UserButton />
          <div className="min-w-0">
            <p className="text-white text-xs font-medium truncate">{CONSULTANT_NAME}</p>
            <p className="text-stone-400 text-xs">Consultant</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ml-64 min-h-screen">{children}</div>
    </div>
  );
}
