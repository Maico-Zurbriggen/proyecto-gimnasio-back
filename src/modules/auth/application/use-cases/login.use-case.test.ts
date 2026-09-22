import bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import { InvalidCredentialsError } from '../../domain/errors/auth-errors';
import { hashSessionToken } from '../../domain/services/session-token';
import type { AuthUsersRepository } from '../ports/auth-users.repository';
import type { SessionsRepository } from '../ports/sessions.repository';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const fixedNow = new Date('2026-09-21T12:00:00Z');
  const clock: Clock = { now: () => fixedNow };
  const passwordHash = bcrypt.hashSync('secret', 4);

  const credentials = {
    id: 'user-1',
    gymId: 'gym-1',
    passwordHash,
    state: 'ACTIVO',
    roles: ['ALUMNO'] as const,
  };

  function buildUseCase(overrides: {
    users?: AuthUsersRepository;
    sessions?: SessionsRepository;
  }): {
    useCase: LoginUseCase;
    users: AuthUsersRepository;
    sessions: SessionsRepository;
  } {
    const users: AuthUsersRepository =
      overrides.users ??
      ({
        findByEmail: vi.fn().mockResolvedValue(credentials),
        findById: vi.fn(),
      } satisfies AuthUsersRepository);
    const sessions: SessionsRepository =
      overrides.sessions ??
      ({
        create: vi.fn().mockImplementation(async (input) => ({
          tokenHash: input.tokenHash,
          userId: input.userId,
          expiresAt: input.expiresAt,
          revokedAt: null,
        })),
        findByTokenHash: vi.fn(),
        revoke: vi.fn(),
        touch: vi.fn(),
      } satisfies SessionsRepository);

    return {
      useCase: new LoginUseCase(users, sessions, clock, 12),
      users,
      sessions,
    };
  }

  it('creates a session with hashed token and twelve-hour expiry on valid credentials', async () => {
    const { useCase, sessions } = buildUseCase({});

    const result = await useCase.execute({
      email: 'alumno.martin@gimnasio.test',
      password: 'secret',
    });

    expect(result.user).toEqual({
      id: 'user-1',
      gymId: 'gym-1',
      roles: ['ALUMNO'],
    });
    expect(result.expiresAt).toEqual(new Date('2026-09-22T00:00:00Z'));
    expect(sessions.create).toHaveBeenCalledWith({
      tokenHash: hashSessionToken(result.sessionToken),
      userId: 'user-1',
      expiresAt: new Date('2026-09-22T00:00:00Z'),
    });
    expect(result.sessionToken).not.toContain(
      hashSessionToken(result.sessionToken),
    );
  });

  it('throws InvalidCredentialsError when the email is unknown', async () => {
    const { useCase, sessions } = buildUseCase({
      users: {
        findByEmail: vi.fn().mockResolvedValue(null),
        findById: vi.fn(),
      },
    });

    await expect(
      useCase.execute({ email: 'missing@gimnasio.test', password: 'secret' }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentialsError on wrong password', async () => {
    const { useCase, sessions } = buildUseCase({});

    await expect(
      useCase.execute({
        email: 'alumno.martin@gimnasio.test',
        password: 'wrong',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentialsError when the user is not active', async () => {
    const { useCase, sessions } = buildUseCase({
      users: {
        findByEmail: vi.fn().mockResolvedValue({
          ...credentials,
          state: 'SUSPENDIDO',
        }),
        findById: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        email: 'alumno.martin@gimnasio.test',
        password: 'secret',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it('throws InvalidCredentialsError instead of crashing on a malformed hash', async () => {
    const { useCase } = buildUseCase({
      users: {
        findByEmail: vi.fn().mockResolvedValue({
          ...credentials,
          passwordHash: 'not-a-bcrypt-hash',
        }),
        findById: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        email: 'alumno.martin@gimnasio.test',
        password: 'secret',
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
