const clerkConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export default async function SignUpPage() {
  if (!clerkConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center text-gray-500">
        Authentication is not configured. Set Clerk env vars to enable sign-up.
      </div>
    );
  }
  const { SignUp } = await import("@clerk/nextjs");
  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <SignUp />
    </div>
  );
}
