import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationNotFoundError } from '../../domain/errors/routine-generation-errors';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';
import { GetRoutineGenerationUseCase } from './get-routine-generation.use-case';

describe('GetRoutineGenerationUseCase', () => {
  it('returns the snapshot when the request exists', async () => {
    const snapshot = {
      requestId: 'req-1',
      status: 'COMPLETADA',
      estructuraCandidata: { dias: [] },
      violaciones: null,
      error: null,
    };
    const repository: RoutineGenerationsRepository = {
      findById: vi.fn().mockResolvedValue(snapshot),
      findRequestOwner: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    const result = await useCase.execute({ requestId: 'req-1' });

    expect(result).toEqual(snapshot);
    expect(repository.findRequestOwner).not.toHaveBeenCalled();
  });

  it('throws RoutineGenerationNotFoundError when the request does not exist', async () => {
    const repository: RoutineGenerationsRepository = {
      findById: vi.fn().mockResolvedValue(null),
      findRequestOwner: vi.fn(),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    await expect(
      useCase.execute({ requestId: 'missing' }),
    ).rejects.toBeInstanceOf(RoutineGenerationNotFoundError);
  });

  it('returns the snapshot when the requester owns the request', async () => {
    const snapshot = {
      requestId: 'req-1',
      status: 'PROCESANDO',
      estructuraCandidata: null,
      violaciones: null,
      error: null,
    };
    const repository: RoutineGenerationsRepository = {
      findById: vi.fn().mockResolvedValue(snapshot),
      findRequestOwner: vi.fn().mockResolvedValue({ studentId: 'student-1' }),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    const result = await useCase.execute({
      requestId: 'req-1',
      requesterStudentId: 'student-1',
    });

    expect(result).toEqual(snapshot);
  });

  it('throws RoutineGenerationNotFoundError when the requester does not own the request', async () => {
    const repository: RoutineGenerationsRepository = {
      findById: vi.fn(),
      findRequestOwner: vi.fn().mockResolvedValue({ studentId: 'student-9' }),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    await expect(
      useCase.execute({ requestId: 'req-1', requesterStudentId: 'student-1' }),
    ).rejects.toBeInstanceOf(RoutineGenerationNotFoundError);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('throws RoutineGenerationNotFoundError when the request has no recorded owner', async () => {
    const repository: RoutineGenerationsRepository = {
      findById: vi.fn(),
      findRequestOwner: vi.fn().mockResolvedValue(null),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    await expect(
      useCase.execute({ requestId: 'req-1', requesterStudentId: 'student-1' }),
    ).rejects.toBeInstanceOf(RoutineGenerationNotFoundError);
    expect(repository.findById).not.toHaveBeenCalled();
  });
});
