const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function SignInPage() {
  if (!clerkConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-gray-500">
        Authentication is not configured. Set Clerk env vars to enable sign-in.
      </div>
    );
  }
  const { SignIn } = await import("@clerk/nextjs");
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <SignIn />
    </div>
  );
}
