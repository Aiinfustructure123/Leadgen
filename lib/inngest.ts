import { Inngest } from "inngest";

export type LeadCreatedEvent = {
  name: "lead/created";
  data: {
    leadId: string;
    sourceEventId: string;
  };
};

export type MessageReceivedEvent = {
  name: "message/received";
  data: {
    leadId: string;
    conversationId: string;
    messageId: string;
  };
};

export type LeadSyncRequestedEvent = {
  name: "lead/sync.requested";
  data: {
    leadId: string;
    reason: string;
  };
};

export const inngest = new Inngest({
  id: "onehomes-concierge",
  name: "One Homes AI Concierge",
});
