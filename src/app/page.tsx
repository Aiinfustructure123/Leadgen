import { SignInButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function HomePage() {
  const { userId } = await auth();
  return (
    <main className="min-h-screen bg-stone-50 flex flex-col items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-stone-900 tracking-tight">One Homes</h1>
          <p className="text-stone-500 mt-2 text-sm font-medium uppercase tracking-widest">
            AI Lead Concierge
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 space-y-4">
          <p className="text-stone-600 text-sm leading-relaxed">
            Instant, intelligent engagement for every property enquiry.
            Powered by Claude AI, delivered via WhatsApp.
          </p>

          {userId ? (
            <Link
              href="/dashboard"
              className="block w-full bg-stone-900 text-white py-3 px-6 rounded-lg font-medium text-sm hover:bg-stone-800 transition-colors text-center"
            >
              Open Dashboard →
            </Link>
          ) : (
            <SignInButton mode="modal">
              <button className="w-full bg-stone-900 text-white py-3 px-6 rounded-lg font-medium text-sm hover:bg-stone-800 transition-colors">
                Sign in to Dashboard
              </button>
            </SignInButton>
          )}
        </div>

        <p className="text-xs text-stone-400">
          For authorised consultants only
        </p>
      </div>
    </main>
  );
}
