import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "One Homes — AI Lead Concierge",
  description: "Instant, intelligent first contact for every property enquiry.",
};

const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const content = (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );

  // Only wrap in ClerkProvider when configured, so the app boots without keys.
  if (clerkConfigured) {
    return <ClerkProvider>{content}</ClerkProvider>;
  }
  return content;
}
