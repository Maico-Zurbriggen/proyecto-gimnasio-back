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
      registerOwnership: vi.fn(),
      findById: vi.fn().mockResolvedValue(snapshot),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    const result = await useCase.execute({
      requestId: 'req-1',
      studentId: 'student-1',
      requestedByUserId: 'trainer-1',
    });

    expect(result).toEqual(snapshot);
  });

  it('throws RoutineGenerationNotFoundError when the request does not exist', async () => {
    const repository: RoutineGenerationsRepository = {
      registerOwnership: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
    };

    const useCase = new GetRoutineGenerationUseCase(repository);

    await expect(
      useCase.execute({
        requestId: 'missing',
        studentId: 'student-1',
        requestedByUserId: 'trainer-1',
      }),
    ).rejects.toBeInstanceOf(RoutineGenerationNotFoundError);
  });
});
