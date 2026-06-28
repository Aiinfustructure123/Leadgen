import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

// Dashboard pages and dashboard API mutations require authentication.
const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/api/dashboard(.*)"]);

const protect = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default function middleware(req: Request, ev: unknown) {
  // No-op when Clerk isn't configured so the app still runs locally.
  if (!clerkConfigured) return NextResponse.next();
  // @ts-expect-error clerkMiddleware accepts (req, event) at runtime.
  return protect(req, ev);
}

export const config = {
  matcher: [
    // Skip Next internals and static files, run on everything else.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
