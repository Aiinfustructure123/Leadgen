import { hasEnv } from "@/lib/env";

/**
 * Whether Clerk is configured. When it isn't (e.g. local dev before keys are
 * added, or during CI build), we degrade gracefully rather than crashing so the
 * rest of the app can still build and run.
 */
export function clerkEnabled(): boolean {
  return hasEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY");
}
