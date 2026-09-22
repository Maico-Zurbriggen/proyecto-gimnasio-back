import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import { hashSessionToken } from '../../domain/services/session-token';
import type { SessionsRepository } from '../ports/sessions.repository';
import { LogoutUseCase } from './logout.use-case';

describe('LogoutUseCase', () => {
  const fixedNow = new Date('2026-09-21T12:00:00Z');
  const clock: Clock = { now: () => fixedNow };

  it('revokes the session matching the token', async () => {
    const sessions: SessionsRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      revoke: vi.fn(),
      touch: vi.fn(),
    };
    const useCase = new LogoutUseCase(sessions, clock);

    await useCase.execute({ sessionToken: 'raw-token' });

    expect(sessions.revoke).toHaveBeenCalledWith(
      hashSessionToken('raw-token'),
      fixedNow,
    );
  });

  it('is a no-op without a session token', async () => {
    const sessions: SessionsRepository = {
      create: vi.fn(),
      findByTokenHash: vi.fn(),
      revoke: vi.fn(),
      touch: vi.fn(),
    };
    const useCase = new LogoutUseCase(sessions, clock);

    await useCase.execute({ sessionToken: null });

    expect(sessions.revoke).not.toHaveBeenCalled();
  });
});
