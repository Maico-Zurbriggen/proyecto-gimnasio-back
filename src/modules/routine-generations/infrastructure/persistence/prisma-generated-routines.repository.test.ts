import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  GeneratedRoutineInvalidError,
  ProposedRoutineAlreadyExistsError,
} from '../../domain/errors/routine-generation-errors';

import { PrismaGeneratedRoutinesRepository } from './prisma-generated-routines.repository';

describe('PrismaGeneratedRoutinesRepository.finalize', () => {
  function fixture() {
    const exerciseId = '41000000-0000-4000-8000-000000000001';
    const patterns = [
      'EMPUJE_HORIZONTAL',
      'TRACCION_HORIZONTAL',
      'DOMINANTE_RODILLA',
      'DOMINANTE_CADERA',
    ];
    const exercises = patterns.map((movementPattern, index) => ({
      id: exerciseId.replace(/001$/, String(index + 1).padStart(3, '0')),
      movementPattern,
      difficultyLevel: 'PRINCIPIANTE',
      equipment: [],
      muscles: [],
      joints: [],
    }));
    const output = {
      schema_version: '1.0',
      routine_type: 'FUERZA',
      target_weekly_frequency: 3,
      days: Array.from({ length: 3 }, (_, day) => ({
        position: day + 1,
        name: `Día ${day + 1}`,
        dominant_pattern: 'EMPUJE_HORIZONTAL',
        exercises: exercises.map((exercise, index) => ({
          position: index + 1,
          exercise_id: exercise.id,
          note: null,
          sets: Array.from({ length: 3 }, (_, set) => ({
            position: set + 1,
            min_repetitions: 3,
            max_repetitions: 6,
            suggested_load: null,
            rest_seconds: 180,
            warmup: false,
          })),
        })),
      })),
      uncovered_patterns: [],
      explanation: 'Candidata para revisión.',
    };
    const owner = {
      requestId: 'request',
      studentId: 'student',
      requestedByUserId: 'student',
    };
    const createRoutine = vi.fn().mockResolvedValue({ id: 'new-routine' });
    const findExercises = vi.fn().mockResolvedValue(exercises);
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      routine: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: createRoutine,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      aiResultValidation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const generation = {
      state: 'COMPLETADA',
      ownership: owner,
      preferences: {} as Record<string, unknown>,
      attempts: [
        {
          result: {
            id: 'result',
            routine: null as { id: string } | null,
            structurallyValid: true,
            structuredOutput: output,
          },
        },
      ],
    };
    const prisma = {
      aiGenerationRequest: {
        findUnique: vi.fn().mockResolvedValue(generation),
      },
      aiResultValidation: transaction.aiResultValidation,
      routine: { findFirst: vi.fn().mockResolvedValue(null) },
      studentProfile: {
        findUnique: vi.fn().mockResolvedValue({
          user: { gymId: 'gym' },
          experienceLevel: 'INTERMEDIO',
          physicalConditions: [],
        }),
      },
      exercise: { findMany: findExercises },
      gymEquipment: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    };
    return {
      prisma,
      owner,
      generation,
      transaction,
      createRoutine,
      findExercises,
      exercises,
    };
  }

  it('finalizes the versioned AI output without inventing loads or activating its version', async () => {
    const { prisma, owner, createRoutine, findExercises, exercises } =
      fixture();
    const result = await new PrismaGeneratedRoutinesRepository(
      prisma as unknown as PrismaClient,
    ).finalize(owner);
    expect(result).toEqual({ routineId: 'new-routine', status: 'PROPUESTA' });
    expect(findExercises).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: exercises.map((exercise) => exercise.id) },
        }),
      }),
    );
    const version = createRoutine.mock.calls[0]![0].data.versions.create;
    expect(version.current).toBe(false);
    expect(
      version.days.create[0].exercises.create[0].sets.create[0].suggestedLoad,
    ).toBeNull();
  });

  it('rejects output that ignores the stored prompt before replacing the previous proposal', async () => {
    const { prisma, owner, generation, transaction, createRoutine } = fixture();
    generation.preferences = {
      free_text: 'Genera rutina con 3 ejercicios de triceps por dia',
      local_test_regeneration: { replaces_proposed_routine_id: 'old-routine' },
    };
    prisma.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    await expect(
      new PrismaGeneratedRoutinesRepository(
        prisma as unknown as PrismaClient,
        true,
      ).finalize(owner),
    ).rejects.toMatchObject({
      violations: [
        expect.stringContaining('Día 1'),
        expect.stringContaining('Día 2'),
        expect.stringContaining('Día 3'),
      ],
    });
    expect(createRoutine).not.toHaveBeenCalled();
    expect(transaction.routine.updateMany).not.toHaveBeenCalled();
    expect(prisma.aiResultValidation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ valid: false }),
      }),
    );
  });

  it('discards only the captured proposal inside the transaction after validating the new output', async () => {
    const { prisma, owner, generation, transaction, createRoutine } = fixture();
    generation.preferences = {
      local_test_regeneration: { replaces_proposed_routine_id: 'old-routine' },
    };
    prisma.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    transaction.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    const result = await new PrismaGeneratedRoutinesRepository(
      prisma as unknown as PrismaClient,
      true,
    ).finalize(owner);
    expect(result.routineId).toBe('new-routine');
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.routine.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'old-routine',
        studentId: owner.studentId,
        state: 'PROPUESTA',
      },
      data: { state: 'DESCARTADA' },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: owner.requestedByUserId,
          entityId: 'old-routine',
          operation: 'LOCAL_ROUTINE_REGENERATION',
        }),
      }),
    );
    expect(createRoutine.mock.calls[0]![0].data.state).toBe('PROPUESTA');
  });

  it('preserves the proposal when the replacement output is invalid', async () => {
    const { prisma, owner, generation, transaction } = fixture();
    generation.preferences = {
      local_test_regeneration: { replaces_proposed_routine_id: 'old-routine' },
    };
    generation.attempts[0]!.result.structurallyValid = false;
    prisma.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    await expect(
      new PrismaGeneratedRoutinesRepository(
        prisma as unknown as PrismaClient,
        true,
      ).finalize(owner),
    ).rejects.toBeInstanceOf(GeneratedRoutineInvalidError);
    expect(transaction.routine.updateMany).not.toHaveBeenCalled();
    expect(transaction.routine.create).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'does not discard a different proposal (local capability %s)',
    async (enabled) => {
      const { prisma, owner, generation, transaction } = fixture();
      generation.preferences = {
        local_test_regeneration: {
          replaces_proposed_routine_id: 'old-routine',
        },
      };
      prisma.routine.findFirst.mockResolvedValue({
        id: enabled ? 'another-routine' : 'old-routine',
      });
      await expect(
        new PrismaGeneratedRoutinesRepository(
          prisma as unknown as PrismaClient,
          enabled,
        ).finalize(owner),
      ).rejects.toBeInstanceOf(ProposedRoutineAlreadyExistsError);
      expect(transaction.routine.updateMany).not.toHaveBeenCalled();
    },
  );

  it('refuses replacement when the captured routine was reviewed concurrently', async () => {
    const { prisma, owner, generation, transaction } = fixture();
    generation.preferences = {
      local_test_regeneration: { replaces_proposed_routine_id: 'old-routine' },
    };
    prisma.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    transaction.routine.findFirst.mockResolvedValue({ id: 'old-routine' });
    transaction.routine.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      new PrismaGeneratedRoutinesRepository(
        prisma as unknown as PrismaClient,
        true,
      ).finalize(owner),
    ).rejects.toBeInstanceOf(ProposedRoutineAlreadyExistsError);
    expect(transaction.routine.create).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it('returns the same routine on repeated finalization without discarding again', async () => {
    const { prisma, owner, generation, transaction } = fixture();
    generation.attempts[0]!.result.routine = { id: 'already-finalized' };
    await expect(
      new PrismaGeneratedRoutinesRepository(
        prisma as unknown as PrismaClient,
        true,
      ).finalize(owner),
    ).resolves.toEqual({ routineId: 'already-finalized', status: 'PROPUESTA' });
    expect(transaction.routine.updateMany).not.toHaveBeenCalled();
  });
});
