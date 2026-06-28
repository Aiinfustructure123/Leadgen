import { getEnv } from "@/lib/env";

export function isClerkEnabled(): boolean {
  return Boolean(getEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && getEnv("CLERK_SECRET_KEY"));
}
