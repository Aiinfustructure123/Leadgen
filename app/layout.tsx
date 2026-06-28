import { ClerkProvider, SignInButton, UserButton } from "@clerk/nextjs";
import type { Metadata } from "next";
import Link from "next/link";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "One Homes AI Lead Concierge",
  description: "AI-powered lead engagement, qualification, and handoff dashboard."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen antialiased">
          <header className="border-b border-stone-200 bg-white/90 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <Link href="/" className="text-sm font-semibold uppercase tracking-[0.25em] text-stone-900">
                One Homes Concierge
              </Link>
              <nav className="flex items-center gap-4 text-sm">
                <Link className="text-stone-600 hover:text-stone-950" href="/dashboard">
                  Dashboard
                </Link>
                <UserButton />
                <SignInButton mode="modal">
                  <button className="rounded-full bg-stone-950 px-4 py-2 text-white">Sign in</button>
                </SignInButton>
              </nav>
            </div>
          </header>
          <main>{children}</main>
        </body>
      </html>
    </ClerkProvider>
  );
}
