import { EventSchemas, Inngest } from "inngest";

/** Strongly-typed event schema for the concierge pipeline. */
export type Events = {
  "lead/created": {
    data: {
      leadId: string;
    };
  };
  "message/received": {
    data: {
      leadId: string;
      conversationId: string;
      messageId: string;
    };
  };
  "lead/sync-requested": {
    data: {
      leadId: string;
    };
  };
  "lead/stale-check": {
    data: {
      leadId: string;
    };
  };
};

export const inngest = new Inngest({
  id: "one-homes-concierge",
  schemas: new EventSchemas().fromRecord<Events>(),
  // Event key is read from INNGEST_EVENT_KEY automatically in production.
});
