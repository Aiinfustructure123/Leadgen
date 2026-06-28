import type { Metadata } from "next";
import { ClerkProvider, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "One Homes AI Lead Concierge",
  description: "AI-powered Salesforce lead engagement over WhatsApp and email.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen antialiased">
          <header className="border-b border-stone-200 bg-white/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <a href="/" className="font-semibold tracking-tight text-slate-950">
                One Homes AI Concierge
              </a>
              <div className="flex items-center gap-4 text-sm">
                <a href="/dashboard" className="text-slate-700 hover:text-slate-950">
                  Dashboard
                </a>
                <SignedOut>
                  <SignInButton mode="modal">
                    <button className="rounded-full bg-slate-950 px-4 py-2 text-white">Sign in</button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton />
                </SignedIn>
              </div>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
