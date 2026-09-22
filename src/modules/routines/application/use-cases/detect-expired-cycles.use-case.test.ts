import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../ports/clock';
import type {
  RenewalCheckCandidate,
  RoutinesRepository,
} from '../ports/routines.repository';
import { Routine } from '../../domain/entities/routine.entity';
import { DetectExpiredCyclesUseCase } from './detect-expired-cycles.use-case';

describe('DetectExpiredCyclesUseCase', () => {
  const fixedNow = new Date('2026-09-08T10:00:00Z');
  const clock: Clock = { now: () => fixedNow };

  function routine(startDate: string, overrides: Partial<{ id: string }> = {}) {
    return new Routine({
      id: overrides.id ?? '22222222-2222-4222-a222-222222222222',
      studentId: '11111111-1111-4111-a111-111111111111',
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date(startDate),
      currentVersionNumber: 1,
    });
  }

  function candidate(
    startDate: string,
    options: {
      id?: string;
      measurementDates?: string[];
      previousProposalDates?: string[];
    } = {},
  ): RenewalCheckCandidate {
    return {
      routine: routine(startDate, { id: options.id }),
      measurementDates: (options.measurementDates ?? []).map(
        (date) => new Date(date),
      ),
      previousProposalDates: (options.previousProposalDates ?? []).map(
        (date) => new Date(date),
      ),
    };
  }

  function buildUseCase(candidates: RenewalCheckCandidate[]) {
    const routinesRepository: RoutinesRepository = {
      findActiveByStudentId: vi.fn(),
      findVigentesForRenewalCheck: vi.fn().mockResolvedValue(candidates),
    };

    return {
      useCase: new DetectExpiredCyclesUseCase(routinesRepository, clock),
      routinesRepository,
    };
  }

  it('returns an empty list when no routine has an expired cycle', async () => {
    const { useCase } = buildUseCase([candidate('2026-08-09T00:00:00Z')]);

    const result = await useCase.execute();

    expect(result).toEqual({
      evaluatedAt: fixedNow.toISOString(),
      expiredCycles: [],
    });
  });

  it('detects an expired cycle with its due date, overdue days and inputs', async () => {
    const { useCase } = buildUseCase([
      candidate('2026-06-30T00:00:00Z', {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        measurementDates: ['2026-08-01T00:00:00Z'],
        previousProposalDates: ['2026-07-01T00:00:00Z'],
      }),
    ]);

    const result = await useCase.execute();

    expect(result.expiredCycles).toEqual([
      {
        routineId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
        studentId: '11111111-1111-4111-a111-111111111111',
        routineType: 'HIPERTROFIA',
        cycleStart: '2026-06-30T00:00:00.000Z',
        dueDate: '2026-08-29T00:00:00.000Z',
        daysOverdue: 10,
        measurementDates: ['2026-08-01T00:00:00.000Z'],
        hasNewMeasurement: true,
        previousProposalDates: ['2026-07-01T00:00:00.000Z'],
      },
    ]);
  });

  it('includes a cycle that completes today with zero days overdue', async () => {
    const { useCase } = buildUseCase([
      candidate('2026-07-10T00:00:00Z', {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      }),
    ]);

    const result = await useCase.execute();

    expect(result.expiredCycles).toEqual([
      expect.objectContaining({
        routineId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
        dueDate: '2026-09-08T00:00:00.000Z',
        daysOverdue: 0,
        hasNewMeasurement: false,
      }),
    ]);
  });

  it('does not count a measurement from the cycle start day as new', async () => {
    const { useCase } = buildUseCase([
      candidate('2026-06-01T00:00:00Z', {
        measurementDates: ['2026-06-01T00:00:00Z'],
      }),
    ]);

    const result = await useCase.execute();

    expect(result.expiredCycles).toHaveLength(1);
    expect(result.expiredCycles[0]?.hasNewMeasurement).toBe(false);
  });

  it('sorts expired cycles by due date and then by routine id', async () => {
    const { useCase } = buildUseCase([
      candidate('2026-06-30T00:00:00Z', {
        id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      }),
      candidate('2026-07-10T00:00:00Z', {
        id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      }),
      candidate('2026-06-01T00:00:00Z', {
        id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      }),
    ]);

    const result = await useCase.execute();

    expect(result.expiredCycles.map((expired) => expired.routineId)).toEqual([
      'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      'cccccccc-cccc-4ccc-cccc-cccccccccccc',
      'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    ]);
  });
});
