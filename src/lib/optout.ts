import { OPT_OUT_KEYWORDS } from "./config";

/** Detect whether an inbound message body is an opt-out request. */
export function isOptOut(body: string): boolean {
  const normalized = body.trim().toLowerCase().replace(/[.!]+$/, "");
  if (!normalized) return false;
  // Exact-match single keywords (STOP, CANCEL, etc.)
  if (OPT_OUT_KEYWORDS.includes(normalized)) return true;
  // Phrase contains (e.g. "please remove me", "i want to opt out")
  return OPT_OUT_KEYWORDS.some(
    (kw) => kw.includes(" ") && normalized.includes(kw)
  );
}
