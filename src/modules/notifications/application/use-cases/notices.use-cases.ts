import type { Clock } from '../../../routines/application/ports/clock';
import type {
  NoticeRecord,
  NoticesRepository,
} from '../ports/notices.repository';

export class NoticeNotFoundError extends Error {}

function toDto(notice: NoticeRecord) {
  return {
    id: notice.id,
    type: notice.type,
    referenceType: notice.referenceType,
    referenceId: notice.referenceId,
    text: notice.text,
    createdAt: notice.createdAt.toISOString(),
    readAt: notice.readAt?.toISOString() ?? null,
  };
}

export class ListOwnNoticesUseCase {
  constructor(private readonly notices: NoticesRepository) {}

  async execute(userId: string) {
    const items = (await this.notices.listActiveForUser(userId)).map(toDto);
    return {
      items,
      unreadCount: items.filter((notice) => notice.readAt === null).length,
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
