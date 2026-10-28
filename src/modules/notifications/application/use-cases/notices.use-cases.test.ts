import { describe, expect, it } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import type {
  NoticeRecord,
  NoticesRepository,
} from '../ports/notices.repository';
import {
  ListOwnNoticesUseCase,
  MarkNoticeReadUseCase,
  NoticeNotFoundError,
} from './notices.use-cases';

const now = new Date('2026-10-28T15:00:00.000Z');
const record: NoticeRecord = {
  id: '10000000-0000-4000-8000-000000000001',
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
    listActiveForUser: async () => [record],
    markRead: async (_noticeId, _userId, readAt) => ({ ...record, readAt }),
    ...overrides,
  };
}

describe('notices use cases', () => {
  it('calculates the unread count from active notices', async () => {
    const result = await new ListOwnNoticesUseCase(repository()).execute(
      'user',
    );
    expect(result).toMatchObject({
      unreadCount: 1,
      items: [{ id: record.id, readAt: null }],
    });
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
