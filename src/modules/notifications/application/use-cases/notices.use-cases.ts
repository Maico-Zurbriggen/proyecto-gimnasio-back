import type { Clock } from '../../../routines/application/ports/clock';
import type {
  NoticeRecord,
  NoticesRepository,
} from '../ports/notices.repository';

export class NoticeNotFoundError extends Error {}

const NOTICE_RETENTION_DAYS = 90;

function retentionStart(now: Date): Date {
  return new Date(now.getTime() - NOTICE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function toDto(notice: NoticeRecord) {
  return {
    id: notice.id,
    audienceRole: notice.audienceRole,
    type: notice.type,
    referenceType: notice.referenceType,
    referenceId: notice.referenceId,
    text: notice.text,
    createdAt: notice.createdAt.toISOString(),
    readAt: notice.readAt?.toISOString() ?? null,
  };
}

export class ListOwnNoticesUseCase {
  constructor(
    private readonly notices: NoticesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, status: 'unread' | 'all') {
    const result = await this.notices.listActiveForUser(userId, {
      includeRead: status === 'all',
      createdAfter: retentionStart(this.clock.now()),
    });
    return {
      items: result.items.map(toDto),
      unreadCount: result.unreadCount,
    };
  }
}

export class MarkNoticeReadUseCase {
  constructor(
    private readonly notices: NoticesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, noticeId: string) {
    const notice = await this.notices.markRead(
      noticeId,
      userId,
      this.clock.now(),
    );
    if (!notice) throw new NoticeNotFoundError();
    return toDto(notice);
  }
}

export class MarkAllNoticesReadUseCase {
  constructor(
    private readonly notices: NoticesRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string) {
    const now = this.clock.now();
    return {
      updatedCount: await this.notices.markAllRead(
        userId,
        now,
        retentionStart(now),
      ),
    };
  }
}
