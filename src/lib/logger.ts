/**
 * Minimal structured logger. Swap for pino/datadog later without changing call
 * sites. Always logs JSON lines so they're greppable in Vercel logs.
 */
type Level = "debug" | "info" | "warn" | "error";

function log(level: Level, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    message,
    ts: new Date().toISOString(),
    ...meta,
  };
  const serialised = JSON.stringify(line, replacer);
  if (level === "error") console.error(serialised);
  else if (level === "warn") console.warn(serialised);
  else console.log(serialised);
}

// Avoid leaking secrets / huge objects, and serialise Errors usefully.
function replacer(_key: string, value: unknown) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export const logger = {
  debug: (m: string, meta?: Record<string, unknown>) => log("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => log("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => log("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => log("error", m, meta),
};
