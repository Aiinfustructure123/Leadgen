import { BUSINESS } from "./config";
import { whatsapp } from "./whatsapp";
import { logger } from "./logger";
import type { Lead } from "@prisma/client";

/**
 * Notify the human consultant that a lead needs attention (escalation).
 * Best-effort: tries WhatsApp to the consultant's number, always logs.
 */
export async function notifyConsultant(params: {
  lead: Lead;
  reason: string;
}): Promise<void> {
  const { lead, reason } = params;
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "A lead";
  const link = `${BUSINESS.appUrl}/dashboard/leads/${lead.id}`;
  const text = `🔔 ${name} needs you.\nReason: ${reason}\nPhone: ${lead.phone ?? "n/a"}\nOpen: ${link}`;

  logger.info("notify.consultant", { leadId: lead.id, reason });

  if (!BUSINESS.consultantPhone) return;
  try {
    await whatsapp.sendFreeform(BUSINESS.consultantPhone, text);
  } catch (err) {
    // Consultant may be outside a session window; non-fatal.
    logger.warn("notify.consultant.whatsapp-failed", {
      leadId: lead.id,
      err: String(err),
    });
  }
}
