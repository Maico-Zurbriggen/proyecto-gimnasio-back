import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import { User } from '../../domain/entities/user.entity';
import { UserNotFoundError } from '../../domain/errors/user-errors';
import type { UsersRepository } from '../ports/users.repository';
import { BlockUserOnInactivityUseCase } from './block-user-on-inactivity.use-case';

describe('BlockUserOnInactivityUseCase', () => {
  const fixedNow = new Date('2026-09-08T12:00:00Z');
  const mockClock: Clock = {
    now: () => fixedNow,
  };

  const createActiveUser = (id = '11111111-1111-4111-a111-111111111111') =>
    new User({
      id,
      gymId: '22222222-2222-4222-a222-222222222222',
      emailNormalized: 'alumno@example.com',
      displayName: 'Alumno Test',
      state: 'ACTIVO',
    });

  it('suspends and saves user when reaching the 3ª falta consecutiva (T5)', async () => {
    const user = createActiveUser();
    const mockRepo: UsersRepository = {
      findById: vi.fn().mockResolvedValue(user),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new BlockUserOnInactivityUseCase(mockRepo, mockClock);
    const result = await useCase.execute({
      userId: user.id,
      consecutiveFaltas: 3,
    });

    expect(result.blocked).toBe(true);
    expect(result.state).toBe('SUSPENDIDO');
    expect(result.consecutiveFaltas).toBe(3);
    expect(result.reason).toContain('3ª falta consecutiva');
    expect(user.isSuspended()).toBe(true);
    expect(mockRepo.save).toHaveBeenCalledWith(user);
  });

  it('suspends user when reaching 9 months of inactivity', async () => {
    const user = createActiveUser();
    const mockRepo: UsersRepository = {
      findById: vi.fn().mockResolvedValue(user),
      save: vi.fn().mockResolvedValue(undefined),
    };

    const useCase = new BlockUserOnInactivityUseCase(mockRepo, mockClock);
    const result = await useCase.execute({
      userId: user.id,
      monthsInactive: 9,
    });

    expect(result.blocked).toBe(true);
    expect(result.state).toBe('SUSPENDIDO');
    expect(result.consecutiveFaltas).toBe(3);
    expect(user.state).toBe('SUSPENDIDO');
    expect(mockRepo.save).toHaveBeenCalledOnce();
  });

  it('leaves user ACTIVO and does not save when user has 1ª falta (3 months)', async () => {
    const user = createActiveUser();
    const mockRepo: UsersRepository = {
      findById: vi.fn().mockResolvedValue(user),
      save: vi.fn(),
    };

    const useCase = new BlockUserOnInactivityUseCase(mockRepo, mockClock);
    const result = await useCase.execute({
      userId: user.id,
      monthsInactive: 3,
    });

    expect(result.blocked).toBe(false);
    expect(result.state).toBe('ACTIVO');
    expect(result.consecutiveFaltas).toBe(1);
    expect(user.isActive()).toBe(true);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('leaves user ACTIVO and does not save when user has 2ª falta (6 months)', async () => {
    const user = createActiveUser();
    const mockRepo: UsersRepository = {
      findById: vi.fn().mockResolvedValue(user),
      save: vi.fn(),
    };

    const useCase = new BlockUserOnInactivityUseCase(mockRepo, mockClock);
    const result = await useCase.execute({
      userId: user.id,
      monthsInactive: 6,
    });

    expect(result.blocked).toBe(false);
    expect(result.state).toBe('ACTIVO');
    expect(result.consecutiveFaltas).toBe(2);
    expect(user.isActive()).toBe(true);
    expect(mockRepo.save).not.toHaveBeenCalled();
  });

  it('throws UserNotFoundError when user does not exist', async () => {
    const mockRepo: UsersRepository = {
      findById: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
    };

    const useCase = new BlockUserOnInactivityUseCase(mockRepo, mockClock);
    await expect(
      useCase.execute({
        userId: 'non-existent-user',
        consecutiveFaltas: 3,
      }),
    ).rejects.toThrow(UserNotFoundError);
  });
});
