/**
 * Centralised environment access.
 *
 * We intentionally do NOT throw at module load time so that `next build`,
 * type-checking, and the dashboard can run without every secret present.
 * Instead, individual providers call `requireEnv(...)` lazily at the point of
 * use and fail loudly only when that specific integration is exercised.
 */

export const env = process.env as Record<string, string | undefined>;

/** Read a required env var, throwing a clear error if missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to your .env.local (see .env.example).`,
    );
  }
  return value;
}

/** Read an optional env var with a fallback default. */
export function optionalEnv(name: string, fallback = ""): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : fallback;
}

/** True when the named env vars are all present (used to gate integrations). */
export function hasEnv(...names: string[]): boolean {
  return names.every((n) => {
    const v = process.env[n];
    return Boolean(v && v.trim() !== "");
  });
}
