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

export type SalesforceSyncEvent = {
  name: "salesforce/sync";
  data: {
    leadId: string;
    conversationId: string;
  };
};

export type Events = LeadCreatedEvent | MessageReceivedEvent | SalesforceSyncEvent;
