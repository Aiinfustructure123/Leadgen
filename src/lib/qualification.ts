import { z } from "zod";

/** Structured qualification data persisted on Lead.qualification (Json). */
export const QualificationSchema = z.object({
  budget: z.string().optional(),
  location: z.string().optional(),
  beds: z.string().optional(),
  timeline: z.string().optional(),
  buyerType: z.enum(["buyer", "investor", "renter", "unknown"]).optional(),
  financing: z.string().optional(),
  viewingInterest: z.boolean().optional(),
  notes: z.string().optional(),
});

export type Qualification = z.infer<typeof QualificationSchema>;

/** Merge new qualification fields onto existing, dropping empties. */
export function mergeQualification(
  existing: Qualification | null | undefined,
  updates: Partial<Qualification>
): Qualification {
  const merged: Qualification = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === null || value === "") continue;
    // @ts-expect-error dynamic assignment of validated keys
    merged[key] = value;
  }
  return merged;
}

/** Human-readable one-line snapshot for dashboards / Salesforce. */
export function qualificationSummary(q: Qualification | null | undefined): string {
  if (!q) return "No qualification data yet";
  const parts: string[] = [];
  if (q.budget) parts.push(`Budget: ${q.budget}`);
  if (q.location) parts.push(`Location: ${q.location}`);
  if (q.beds) parts.push(`Beds: ${q.beds}`);
  if (q.timeline) parts.push(`Timeline: ${q.timeline}`);
  if (q.buyerType && q.buyerType !== "unknown") parts.push(`Type: ${q.buyerType}`);
  if (q.financing) parts.push(`Financing: ${q.financing}`);
  if (q.viewingInterest !== undefined)
    parts.push(`Viewing: ${q.viewingInterest ? "interested" : "not yet"}`);
  return parts.length ? parts.join(" · ") : "No qualification data yet";
}
