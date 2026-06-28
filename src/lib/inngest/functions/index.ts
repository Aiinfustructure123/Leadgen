import { onLeadCreated } from "@/lib/inngest/functions/onLeadCreated";
import { onMessageReceived } from "@/lib/inngest/functions/onMessageReceived";
import { syncToSalesforce } from "@/lib/inngest/functions/syncToSalesforce";
import { staleLeadNudge } from "@/lib/inngest/functions/staleLeadNudge";

export const functions = [
  onLeadCreated,
  onMessageReceived,
  syncToSalesforce,
  staleLeadNudge,
];
