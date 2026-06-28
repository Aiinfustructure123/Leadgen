import { Inngest } from "inngest";

import { env } from "@/lib/config";

export const inngest = new Inngest({
  id: "one-homes-ai-lead-concierge",
  eventKey: env("INNGEST_EVENT_KEY")
});
