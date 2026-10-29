export interface NoticeRecord {
  id: string;
  audienceRole: string | null;
  type: string;
  referenceType: string;
  referenceId: string;
  text: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NoticesRepository {
  listActiveForUser(
    userId: string,
    options: { includeRead: boolean; createdAfter: Date },
  ): Promise<{ items: NoticeRecord[]; unreadCount: number }>;
  markRead(
    noticeId: string,
    userId: string,
    readAt: Date,
  ): Promise<NoticeRecord | null>;
  markAllRead(
    userId: string,
    readAt: Date,
    createdAfter: Date,
  ): Promise<number>;
}
