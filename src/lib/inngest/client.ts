import { EventSchemas, Inngest } from "inngest";

/** Typed event payloads for the lead concierge pipeline. */
type Events = {
  "lead/created": { data: { leadId: string } };
  "message/received": {
    data: { leadId: string; conversationId: string; messageId: string };
  };
  "lead/sync-salesforce": { data: { leadId: string } };
  "lead/stale-check": { data: { leadId: string } };
};

export const inngest = new Inngest({
  id: "one-homes-lead-concierge",
  schemas: new EventSchemas().fromRecord<Events>(),
});
