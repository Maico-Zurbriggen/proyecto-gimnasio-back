import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import type {
  NoticeRecord,
  NoticesRepository,
} from '../ports/notices.repository';
import {
  ListOwnNoticesUseCase,
  MarkAllNoticesReadUseCase,
  MarkNoticeReadUseCase,
  NoticeNotFoundError,
} from './notices.use-cases';

const now = new Date('2026-10-28T15:00:00.000Z');
const record: NoticeRecord = {
  id: '10000000-0000-4000-8000-000000000001',
  audienceRole: 'ENTRENADOR',
  type: 'INCOMPATIBILIDAD_SOBREVENIDA',
  referenceType: 'ADAPTATION_PROPOSAL',
  referenceId: '20000000-0000-4000-8000-000000000001',
  text: 'La rutina requiere revisión.',
  createdAt: now,
  readAt: null,
};

function repository(
  overrides: Partial<NoticesRepository> = {},
): NoticesRepository {
  return {
    listActiveForUser: async () => ({ items: [record], unreadCount: 1 }),
    markRead: async (_noticeId, _userId, readAt) => ({ ...record, readAt }),
    markAllRead: async () => 1,
    ...overrides,
  };
}

describe('notices use cases', () => {
  it('calculates the unread count from active notices', async () => {
    const clock: Clock = { now: () => now };
    const result = await new ListOwnNoticesUseCase(repository(), clock).execute(
      'user',
      'unread',
    );
    expect(result).toMatchObject({
      unreadCount: 1,
      items: [{ id: record.id, readAt: null }],
    });
  });

  it('requests only unread notices from the last 90 days by default', async () => {
    let received: { includeRead: boolean; createdAfter: Date } | undefined;
    const clock: Clock = { now: () => now };
    const repo = repository({
      listActiveForUser: async (_userId, options) => {
        received = options;
        return { items: [], unreadCount: 0 };
      },
    });
    await new ListOwnNoticesUseCase(repo, clock).execute('user', 'unread');
    expect(received).toEqual({
      includeRead: false,
      createdAfter: new Date('2026-07-30T15:00:00.000Z'),
    });
  });

  it('marks all recent unread notices using the same retention window', async () => {
    const clock: Clock = { now: () => now };
    const result = await new MarkAllNoticesReadUseCase(
      repository({ markAllRead: async () => 3 }),
      clock,
    ).execute('user');
    expect(result).toEqual({ updatedCount: 3 });
  });

  it('marks an own notice using the application clock', async () => {
    const clock: Clock = { now: () => now };
    const result = await new MarkNoticeReadUseCase(repository(), clock).execute(
      'user',
      record.id,
    );
    expect(result.readAt).toBe(now.toISOString());
  });

  it('does not disclose a notice owned by another actor', async () => {
    const clock: Clock = { now: () => now };
    const useCase = new MarkNoticeReadUseCase(
      repository({ markRead: async () => null }),
      clock,
    );
    await expect(
      useCase.execute('other-user', record.id),
    ).rejects.toBeInstanceOf(NoticeNotFoundError);
  });
});
