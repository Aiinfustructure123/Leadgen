import { Inngest } from "inngest";

import type { Events } from "@/lib/inngest/events";

export const inngest = new Inngest({
  id: "one-homes-ai-lead-concierge",
});

export type InngestEvents = Events;
