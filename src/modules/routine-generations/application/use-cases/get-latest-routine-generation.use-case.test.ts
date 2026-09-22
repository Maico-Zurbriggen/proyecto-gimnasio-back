import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationNotFoundError } from '../../domain/errors/routine-generation-errors';
import type { LatestRoutineGenerationRepository } from '../ports/latest-routine-generation.repository';
import { GetLatestRoutineGenerationUseCase } from './get-latest-routine-generation.use-case';

describe('GetLatestRoutineGenerationUseCase', () => {
  it('returns the latest snapshot for the student', async () => {
    const snapshot = {
      requestId: 'request-1',
      status: 'COMPLETADA',
      estructuraCandidata: { days: [] },
      violaciones: null,
      error: null,
    };
    const repository: LatestRoutineGenerationRepository = {
      findLatestByStudentId: vi.fn().mockResolvedValue(snapshot),
    };

    const result = await new GetLatestRoutineGenerationUseCase(
      repository,
    ).execute('student-1');

    expect(result).toEqual(snapshot);
    expect(repository.findLatestByStudentId).toHaveBeenCalledWith('student-1');
  });

  it('throws when the student has no generation requests', async () => {
    const repository: LatestRoutineGenerationRepository = {
      findLatestByStudentId: vi.fn().mockResolvedValue(null),
    };

    await expect(
      new GetLatestRoutineGenerationUseCase(repository).execute('student-1'),
    ).rejects.toBeInstanceOf(RoutineGenerationNotFoundError);
  });
});
