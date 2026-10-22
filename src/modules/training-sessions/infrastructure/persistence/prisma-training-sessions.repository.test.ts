import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaTrainingSessionsRepository } from './prisma-training-sessions.repository';
import { sessionResponseSchemas } from '../http/session-response.schemas';

const studentId = '11111111-1111-4111-a111-111111111111';
const gymId = '99999999-9999-4999-a999-999999999999';
const sessionId = '22222222-2222-4222-a222-222222222222';
const dayId = '33333333-3333-4333-a333-333333333333';
const exerciseId = '66666666-6666-4666-a666-666666666666';
const routineId = '44444444-4444-4444-a444-444444444444';
const versionId = '55555555-5555-4555-a555-555555555555';
const now = new Date('2026-10-22T02:30:00Z');
const actor = { id: studentId, gymId, roles: ['ALUMNO'] as ['ALUMNO'] };

function setup() {
  const day = {
    id: dayId,
    name: 'Day A',
    position: 1,
    exercises: [
      {
        exerciseId,
        exercise: { name: 'Bench' },
        position: 1,
        note: 'Frozen note',
        compatibilityState: 'COMPATIBLE',
        sets: [
          {
            position: 1,
            minRepetitions: 6,
            maxRepetitions: 10,
            suggestedLoad: 40,
            restSeconds: 120,
            warmup: true,
          },
          {
            position: 2,
            minRepetitions: 8,
            maxRepetitions: 12,
            suggestedLoad: null,
            restSeconds: 90,
            warmup: false,
          },
        ],
      },
      {
        exerciseId,
        exercise: { name: 'Bench variant' },
        position: 2,
        note: null,
        compatibilityState: 'COMPATIBLE',
        sets: [
          {
            position: 1,
            minRepetitions: 5,
            maxRepetitions: 8,
            suggestedLoad: 50,
            restSeconds: 180,
            warmup: false,
          },
        ],
      },
    ],
  };
  const routine = {
    id: routineId,
    versions: [{ id: versionId, versionNumber: 7, days: [day] }],
  };
  let saved: object | null = null;
  const tx = {
    studentProfile: {
      findFirst: vi.fn().mockResolvedValue({
        user: { gym: { timezone: 'America/Argentina/Buenos_Aires' } },
      }),
    },
    routine: { findFirst: vi.fn(async () => routine) },
    fitnessClearance: { findFirst: vi.fn().mockResolvedValue(null) },
    trainingSession: {
      findFirst: vi.fn(async () => saved),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: Record<string, unknown> & { setRecords: { create: unknown[] } };
        }) => {
          saved = structuredClone({
            ...data,
            id: sessionId,
            completedAt: null,
            simulated: false,
            additionalSetRecords: [],
            setRecords: data.setRecords.create.map((record) => ({
              ...(record as object),
              performedExerciseId: null,
              performedExerciseName: null,
              performedLoad: null,
              performedRepetitions: null,
              perceivedEffort: null,
              completed: false,
              additional: false,
              omissionReason: null,
              atypicalConfirmed: false,
            })),
          });
          return saved;
        },
      ),
    },
  };
  const transaction = vi.fn(
    async (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  );
  const repository = new PrismaTrainingSessionsRepository({
    $transaction: transaction,
  } as unknown as PrismaClient);
  return { tx, transaction, day, routine, repository };
}

describe('HU21 snapshot persistence adapter', () => {
  it('copies the complete ordered prescription in one repeatable-read transaction', async () => {
    const { repository, transaction, tx } = setup();
    const result = await repository.start({
      actor,
      studentId,
      routineDayId: dayId,
      now,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(tx.trainingSession.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      routineVersionId: versionId,
      routineVersionNumber: 7,
      routineDayName: 'Day A',
      timezone: 'America/Argentina/Buenos_Aires',
      occurredOn: '2026-10-21',
      snapshotComplete: true,
    });
    expect(
      result.setRecords.map((record) => [
        record.position,
        record.prescribedExercisePosition,
        record.prescribedSetPosition,
      ]),
    ).toEqual([
      [1, 1, 1],
      [2, 1, 2],
      [3, 2, 1],
    ]);
    expect(result.setRecords[0]).toMatchObject({
      prescribedExerciseId: exerciseId,
      prescribedExerciseName: 'Bench',
      prescribedMinRepetitions: 6,
      prescribedMaxRepetitions: 10,
      prescribedLoad: 40,
      prescribedRestSeconds: 120,
      prescribedNote: 'Frozen note',
      prescribedWarmup: true,
    });
    expect(result.setRecords[1]!.prescribedLoad).toBeNull();
    expect(
      sessionResponseSchemas.TrainingSession.safeParse(
        JSON.parse(JSON.stringify(result)),
      ).success,
    ).toBe(true);
  });

  it('reads only the saved snapshot after the day, catalogue and current version change', async () => {
    const { repository, day, routine, tx } = setup();
    const initial = await repository.start({
      actor,
      studentId,
      routineDayId: dayId,
      now,
    });
    day.name = 'Edited';
    day.exercises[0]!.exercise.name = 'Renamed';
    day.exercises[0]!.sets[0]!.restSeconds = 999;
    routine.versions[0]!.id = 'new-version';
    tx.routine.findFirst.mockClear();
    const again = await repository.getById({
      actor,
      studentId,
      sessionId,
      now,
    });
    expect(again).toEqual(initial);
    expect(tx.routine.findFirst).not.toHaveBeenCalled();
    expect(tx.trainingSession.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({
        include: expect.not.objectContaining({ routineDay: expect.anything() }),
      }),
    );
  });

  it('retries serialization conflicts while propagating snapshot write failures', async () => {
    const { repository, transaction, tx } = setup();
    transaction.mockRejectedValueOnce({ code: 'P2034' });
    expect(
      (await repository.start({ actor, studentId, routineDayId: dayId, now }))
        .routineVersionId,
    ).toBe(versionId);
    expect(transaction).toHaveBeenCalledTimes(2);
    const broken = setup();
    broken.tx.trainingSession.create.mockRejectedValueOnce(
      new Error('Storage failure'),
    );
    await expect(
      broken.repository.start({ actor, studentId, routineDayId: dayId, now }),
    ).rejects.toThrow('Storage failure');
    expect(broken.transaction).toHaveBeenCalledTimes(1);
    expect(tx.trainingSession.create).toHaveBeenCalledTimes(1);
  });
});
