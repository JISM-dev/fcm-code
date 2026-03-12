export type NotificationDataPayload = {
  token?: string;
  title?: string;
  body?: string;
  type?: string;
  itemId?: string;
  sectionId?: string;
};

export type NotificationBatchPayload = {
  tokens?: string[];
  title?: string;
  body?: string;
  type?: string;
  itemId?: string;
  sectionId?: string;
};

export type NotificationBatchQueueItem = {
  requestId: string;
  tokens: string[];
  title: string;
  body: string;
  type: string | null;
  itemId: string | null;
  sectionId: string | null;
};

export type EnqueueBatchNotificationResult = {
  requestId: string;
  acceptedCount: number;
};
