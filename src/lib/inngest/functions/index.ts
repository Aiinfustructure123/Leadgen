import { onLeadCreated } from "./onLeadCreated";
import { onMessageReceived } from "./onMessageReceived";
import { syncToSalesforce } from "./syncToSalesforce";
import { staleLeadNudge } from "./staleLeadNudge";

export const functions = [
  onLeadCreated,
  onMessageReceived,
  syncToSalesforce,
  staleLeadNudge,
];

export { onLeadCreated, onMessageReceived, syncToSalesforce, staleLeadNudge };
