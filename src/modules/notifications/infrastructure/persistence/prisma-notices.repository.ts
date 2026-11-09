import type { PrismaClient } from '@prisma/client';

import type {
  NoticeRecord,
  NoticesRepository,
} from '../../application/ports/notices.repository';

export class PrismaNoticesRepository implements NoticesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listActiveForUser(
    userId: string,
    options: { includeRead: boolean; createdAfter: Date },
  ): Promise<{ items: NoticeRecord[]; unreadCount: number }> {
    const baseWhere = {
      recipientUserId: userId,
      expired: false,
      createdAt: { gte: options.createdAfter },
    } as const;
    const [items, unreadCount] = await Promise.all([
      this.prisma.notice.findMany({
        where: {
          ...baseWhere,
          ...(options.includeRead ? {} : { readAt: null }),
        },
        orderBy: [
          { readAt: { sort: 'asc', nulls: 'first' } },
          { createdAt: 'desc' },
        ],
        take: 50,
      }),
      this.prisma.notice.count({ where: { ...baseWhere, readAt: null } }),
    ]);
    return { items, unreadCount };
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

  async markAllRead(
    userId: string,
    readAt: Date,
    createdAfter: Date,
  ): Promise<number> {
    const result = await this.prisma.notice.updateMany({
      where: {
        recipientUserId: userId,
        expired: false,
        readAt: null,
        createdAt: { gte: createdAfter },
      },
      data: { readAt },
    });
    return result.count;
  }
}
