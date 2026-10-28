export interface NoticeRecord {
  id: string;
  type: string;
  referenceType: string;
  referenceId: string;
  text: string;
  createdAt: Date;
  readAt: Date | null;
}

export interface NoticesRepository {
  listActiveForUser(userId: string): Promise<NoticeRecord[]>;
  markRead(
    noticeId: string,
    userId: string,
    readAt: Date,
  ): Promise<NoticeRecord | null>;
}
