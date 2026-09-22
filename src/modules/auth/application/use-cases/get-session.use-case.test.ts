import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import { InvalidSessionError } from '../../domain/errors/auth-errors';
import type { AuthUsersRepository } from '../ports/auth-users.repository';
import type { SessionsRepository } from '../ports/sessions.repository';
import { GetSessionUseCase } from './get-session.use-case';

describe('GetSessionUseCase', () => {
  const fixedNow = new Date('2026-09-21T12:00:00Z');
  const clock: Clock = { now: () => fixedNow };

  const credentials = {
    id: 'user-1',
    gymId: 'gym-1',
    passwordHash: 'hash',
    state: 'ACTIVO',
    roles: ['ENTRENADOR'] as const,
  };
  const record = {
    tokenHash: 'token-hash',
    userId: 'user-1',
    expiresAt: new Date('2026-09-22T00:00:00Z'),
    revokedAt: null,
  };

  function buildUseCase(overrides: {
    users?: AuthUsersRepository;
    sessions?: SessionsRepository;
  }): { useCase: GetSessionUseCase; sessions: SessionsRepository } {
    const users: AuthUsersRepository =
      overrides.users ??
      ({
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue(credentials),
      } satisfies AuthUsersRepository);
    const sessions: SessionsRepository =
      overrides.sessions ??
      ({
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue(record),
        revoke: vi.fn(),
        touch: vi.fn(),
      } satisfies SessionsRepository);

    return {
      useCase: new GetSessionUseCase(users, sessions, clock),
      sessions,
    };
  }

  it('returns the session user and touches last activity', async () => {
    const { useCase, sessions } = buildUseCase({});

    const result = await useCase.execute({ sessionToken: 'raw-token' });

    expect(result).toEqual({
      id: 'user-1',
      gymId: 'gym-1',
      roles: ['ENTRENADOR'],
    });
    expect(sessions.touch).toHaveBeenCalledWith('token-hash', fixedNow);
  });

  it('throws InvalidSessionError when the token is unknown', async () => {
    const { useCase, sessions } = buildUseCase({
      sessions: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue(null),
        revoke: vi.fn(),
        touch: vi.fn(),
      },
    });

    await expect(
      useCase.execute({ sessionToken: 'unknown' }),
    ).rejects.toBeInstanceOf(InvalidSessionError);
    expect(sessions.touch).not.toHaveBeenCalled();
  });

  it('throws InvalidSessionError when the session expired', async () => {
    const { useCase } = buildUseCase({
      sessions: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue({
          ...record,
          expiresAt: fixedNow,
        }),
        revoke: vi.fn(),
        touch: vi.fn(),
      },
    });

    await expect(
      useCase.execute({ sessionToken: 'raw-token' }),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('throws InvalidSessionError when the session was revoked', async () => {
    const { useCase } = buildUseCase({
      sessions: {
        create: vi.fn(),
        findByTokenHash: vi.fn().mockResolvedValue({
          ...record,
          revokedAt: new Date('2026-09-21T11:00:00Z'),
        }),
        revoke: vi.fn(),
        touch: vi.fn(),
      },
    });

    await expect(
      useCase.execute({ sessionToken: 'raw-token' }),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });

  it('throws InvalidSessionError when the user no longer exists or is inactive', async () => {
    const { useCase } = buildUseCase({
      users: {
        findByEmail: vi.fn(),
        findById: vi.fn().mockResolvedValue({
          ...credentials,
          state: 'SUSPENDIDO',
        }),
      },
    });

    await expect(
      useCase.execute({ sessionToken: 'raw-token' }),
    ).rejects.toBeInstanceOf(InvalidSessionError);
  });
});
