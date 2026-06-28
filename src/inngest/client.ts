import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "one-homes-concierge",
  // eventKey is read from INNGEST_EVENT_KEY env var automatically when not set here
  ...(process.env.INNGEST_EVENT_KEY ? { eventKey: process.env.INNGEST_EVENT_KEY } : {}),
});

// Typed event definitions
export type Events = {
  "lead/created": {
    data: {
      leadId: string;
      salesforceId?: string;
    };
  };
  "message/received": {
    data: {
      leadId: string;
      conversationId: string;
      messageId: string;
    };
  };
  "salesforce/sync": {
    data: {
      leadId: string;
      conversationId: string;
    };
  };
};
