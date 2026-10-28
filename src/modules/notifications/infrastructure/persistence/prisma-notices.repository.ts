import type { PrismaClient } from '@prisma/client';

import type {
  NoticeRecord,
  NoticesRepository,
} from '../../application/ports/notices.repository';

export class PrismaNoticesRepository implements NoticesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveForUser(userId: string): Promise<NoticeRecord[]> {
    return this.prisma.notice.findMany({
      where: { recipientUserId: userId, expired: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(
    noticeId: string,
    userId: string,
    readAt: Date,
  ): Promise<NoticeRecord | null> {
    await this.prisma.notice.updateMany({
      where: {
        id: noticeId,
        recipientUserId: userId,
        expired: false,
        readAt: null,
      },
      data: { readAt },
    });
    return this.prisma.notice.findFirst({
      where: { id: noticeId, recipientUserId: userId, expired: false },
    });
  }
}
