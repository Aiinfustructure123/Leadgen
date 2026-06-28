import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "One Homes — AI Lead Concierge",
  description:
    "Instant, intelligent first contact for every property enquiry — WhatsApp + email, powered by Claude.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const body = (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );

  // Only mount ClerkProvider when configured, so builds/dev work without keys.
  if (clerkEnabled()) {
    return <ClerkProvider>{body}</ClerkProvider>;
  }
  return body;
}
