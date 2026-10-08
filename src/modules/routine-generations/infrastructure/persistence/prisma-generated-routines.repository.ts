import { Prisma, type PrismaClient } from '@prisma/client';
import { finalizeGenerationV2 } from './finalize-generation-v2';

import { adaptRoutineGenerationOutput } from '../../../../integrations/ai/routine-generation-output.mapper';

import type {
  FinalizedGeneratedRoutine,
  GeneratedRoutinesRepository,
} from '../../application/ports/generated-routines.repository';
import type { RoutineGenerationOwner } from '../../application/ports/routine-generations.repository';
import {
  GeneratedRoutineInvalidError,
  ProposedRoutineAlreadyExistsError,
  RoutineGenerationNotCompletedError,
  RoutineGenerationNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import { validateGeneratedRoutine } from '../../domain/services/generated-routine-validator';
import {
  extractMuscleCountRequirements,
  validateMuscleCountRequirements,
} from '../../domain/services/generation-request-requirements';

const VALIDATOR_VERSION = 'routine-generation-backend@1.2';
const LEVEL_RANK = { PRINCIPIANTE: 0, INTERMEDIO: 1, AVANZADO: 2 } as const;

interface Compatibility {
  state: 'COMPATIBLE' | 'ADVERTIDO';
  reason: string | null;
}

export class PrismaGeneratedRoutinesRepository implements GeneratedRoutinesRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly allowLocalRegeneration = false,
  ) {}

  async finalize(
    owner: RoutineGenerationOwner,
  ): Promise<FinalizedGeneratedRoutine> {
    const request = await this.prisma.aiGenerationRequest.findUnique({
      where: { id: owner.requestId },
      include: {
        ownership: true,
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: {
            result: { include: { routine: { select: { id: true } } } },
          },
        },
      },
    });
    if (
      !request ||
      request.ownership?.studentId !== owner.studentId ||
      request.ownership.requestedByUserId !== owner.requestedByUserId
    ) {
      throw new RoutineGenerationNotFoundError();
    }

    const result = request.attempts[0]?.result;
    if (result?.routine) {
      return { routineId: result.routine.id, status: 'PROPUESTA' };
    }
    if (request.state !== 'COMPLETADA' || !result) {
      throw new RoutineGenerationNotCompletedError();
    }
    const replacementId = this.replacementRoutineId(request.preferences);
    const preferences = request.preferences;
    if (
      preferences &&
      typeof preferences === 'object' &&
      !Array.isArray(preferences) &&
      preferences.schema_version === '2.0'
    ) {
      return finalizeGenerationV2(
        this.prisma,
        request,
        result,
        owner,
        replacementId,
      );
    }
    const proposed = await this.prisma.routine.findFirst({
      where: { studentId: owner.studentId, state: 'PROPUESTA' },
      select: { id: true },
    });
    if (proposed && proposed.id !== replacementId) {
      throw new ProposedRoutineAlreadyExistsError();
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: owner.studentId },
      include: {
        user: { select: { gymId: true } },
        physicalConditions: true,
      },
    });
    if (!student) throw new RoutineGenerationNotFoundError('Student not found');

    const generatedOutput = adaptRoutineGenerationOutput(
      result.structuredOutput,
    );
    const exerciseIds = this.extractExerciseIds(generatedOutput);
    const [exercises, equipment] = await Promise.all([
      this.prisma.exercise.findMany({
        where: {
          id: { in: exerciseIds },
          OR: [{ gymId: student.user.gymId }, { origin: 'CATALOGO_BASE' }],
        },
        include: { equipment: true, muscles: true, joints: true },
      }),
      this.prisma.gymEquipment.findMany({
        where: { gymId: student.user.gymId, present: true },
        select: { equipmentCode: true },
      }),
    ]);

    const availableEquipment = new Set(
      equipment.map((item) => item.equipmentCode),
    );
    const now = new Date();
    const activeConditions = student.physicalConditions.filter(
      (condition) =>
        condition.startsOn <= now &&
        (condition.endsOn === null || condition.endsOn >= now),
    );
    const compatibilityByExercise = new Map<string, Compatibility>();
    const compatibleExercises = exercises.filter((exercise) => {
      if (
        LEVEL_RANK[exercise.difficultyLevel] >
        LEVEL_RANK[student.experienceLevel]
      ) {
        return false;
      }
      if (
        exercise.equipment.some(
          (requirement) => !availableEquipment.has(requirement.equipmentCode),
        )
      ) {
        return false;
      }

      const affectingConditions = activeConditions.filter(
        (condition) =>
          exercise.muscles.some(
            (muscle) =>
              muscle.participation === 'PRIMARIA' &&
              muscle.muscleCode === condition.bodyZoneCode,
          ) ||
          exercise.joints.some(
            (joint) => joint.jointCode === condition.bodyZoneCode,
          ),
      );
      if (
        affectingConditions.some((condition) => condition.severity !== 'LEVE')
      ) {
        return false;
      }
      compatibilityByExercise.set(exercise.id, {
        state: affectingConditions.length > 0 ? 'ADVERTIDO' : 'COMPATIBLE',
        reason:
          affectingConditions.length > 0
            ? 'Condición física leve relacionada con el ejercicio.'
            : null,
      });
      return true;
    });

    const validation = result.structurallyValid
      ? validateGeneratedRoutine(
          generatedOutput,
          compatibleExercises.map((exercise) => ({
            id: exercise.id,
            movementPattern: exercise.movementPattern,
          })),
        )
      : {
          routine: null,
          violations: ['El servicio IA marcó la salida como inválida.'],
        };

    if (validation.routine) {
      const preferences = request.preferences;
      const text =
        preferences &&
        typeof preferences === 'object' &&
        !Array.isArray(preferences) &&
        typeof preferences.free_text === 'string'
          ? preferences.free_text
          : null;
      const violations = validateMuscleCountRequirements(
        validation.routine.days,
        compatibleExercises.map((exercise) => ({
          id: exercise.id,
          primaryMuscles: exercise.muscles
            .filter((muscle) => muscle.participation === 'PRIMARIA')
            .map((muscle) => muscle.muscleCode),
        })),
        extractMuscleCountRequirements(text),
      );
      if (violations.length) {
        await this.saveInvalidValidation(result.id, violations);
        throw new GeneratedRoutineInvalidError(violations);
      }
    }

    if (!validation.routine) {
      await this.saveInvalidValidation(result.id, validation.violations);
      throw new GeneratedRoutineInvalidError(validation.violations);
    }

    try {
      const routine = validation.routine;
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT user_id FROM app.student_profiles
          WHERE user_id = ${owner.studentId}::uuid FOR UPDATE
        `;
        const existing = await tx.routine.findUnique({
          where: { sourceGenerationResultId: result.id },
          select: { id: true },
        });
        if (existing) return existing;
        const pending = await tx.routine.findFirst({
          where: { studentId: owner.studentId, state: 'PROPUESTA' },
          select: { id: true },
        });
        if (pending) {
          if (pending.id !== replacementId) {
            throw new ProposedRoutineAlreadyExistsError();
          }
          const discarded = await tx.routine.updateMany({
            where: {
              id: pending.id,
              studentId: owner.studentId,
              state: 'PROPUESTA',
            },
            data: { state: 'DESCARTADA' },
          });
          if (discarded.count !== 1) {
            throw new ProposedRoutineAlreadyExistsError();
          }
          await tx.auditLog.create({
            data: {
              actorUserId: owner.requestedByUserId,
              operation: 'LOCAL_ROUTINE_REGENERATION',
              entityType: 'ROUTINE',
              entityId: pending.id,
              previousValue: { state: 'PROPUESTA' },
              newValue: {
                state: 'DESCARTADA',
                generationRequestId: owner.requestId,
              },
            },
          });
        }

        const storedValidation = await tx.aiResultValidation.findFirst({
          where: {
            resultId: result.id,
            validatorVersion: VALIDATOR_VERSION,
            valid: true,
          },
        });
        if (!storedValidation) {
          await tx.aiResultValidation.create({
            data: {
              resultId: result.id,
              validatorVersion: VALIDATOR_VERSION,
              valid: true,
              violations: [],
            },
          });
        }

        return tx.routine.create({
          data: {
            studentId: owner.studentId,
            sourceGenerationResultId: result.id,
            routineType: routine.routineType,
            targetWeeklyFrequency: routine.targetWeeklyFrequency,
            state: 'PROPUESTA',
            origin: 'GENERADA',
            requestedByUserId: owner.requestedByUserId,
            versions: {
              create: {
                versionNumber: 1,
                current: false,
                createdByUserId: owner.requestedByUserId,
                days: {
                  create: routine.days.map((day) => ({
                    position: day.position,
                    name: day.name,
                    dominantPattern: day.dominantPattern,
                    exercises: {
                      create: day.exercises.map((exercise) => {
                        const compatibility = compatibilityByExercise.get(
                          exercise.exerciseId,
                        );
                        return {
                          exerciseId: exercise.exerciseId,
                          position: exercise.position,
                          note: exercise.note,
                          compatibilityState:
                            compatibility?.state ?? 'COMPATIBLE',
                          compatibilityReason: compatibility?.reason ?? null,
                          sets: {
                            create: exercise.sets.map((set) => ({
                              position: set.position,
                              minRepetitions: set.minRepetitions,
                              maxRepetitions: set.maxRepetitions,
                              suggestedLoad:
                                set.suggestedLoad === null
                                  ? null
                                  : new Prisma.Decimal(set.suggestedLoad),
                              restSeconds: set.restSeconds,
                              warmup: set.warmup,
                            })),
                          },
                        };
                      }),
                    },
                  })),
                },
              },
            },
          },
          select: { id: true },
        });
      });
      return { routineId: created.id, status: 'PROPUESTA' };
    } catch (error) {
      if (
        error instanceof ProposedRoutineAlreadyExistsError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002')
      ) {
        throw new ProposedRoutineAlreadyExistsError();
      }
      throw error;
    }
  }

  private replacementRoutineId(preferences: unknown): string | null {
    if (
      !this.allowLocalRegeneration ||
      !preferences ||
      typeof preferences !== 'object' ||
      !('local_test_regeneration' in preferences)
    ) {
      return null;
    }
    const replacement = preferences.local_test_regeneration;
    if (
      !replacement ||
      typeof replacement !== 'object' ||
      !('replaces_proposed_routine_id' in replacement)
    ) {
      return null;
    }
    return typeof replacement.replaces_proposed_routine_id === 'string'
      ? replacement.replaces_proposed_routine_id
      : null;
  }

  private async saveInvalidValidation(
    resultId: string,
    violations: string[],
  ): Promise<void> {
    const existing = await this.prisma.aiResultValidation.findFirst({
      where: { resultId, validatorVersion: VALIDATOR_VERSION },
    });
    if (!existing) {
      await this.prisma.aiResultValidation.create({
        data: {
          resultId,
          validatorVersion: VALIDATOR_VERSION,
          valid: false,
          violations,
        },
      });
    }
  }

  private extractExerciseIds(output: unknown): string[] {
    if (!output || typeof output !== 'object' || Array.isArray(output))
      return [];
    const days = (output as Record<string, unknown>).dias;
    if (!Array.isArray(days)) return [];
    const ids = new Set<string>();
    for (const day of days) {
      if (!day || typeof day !== 'object' || Array.isArray(day)) continue;
      if (!Array.isArray(day.ejercicios)) continue;
      for (const exercise of day.ejercicios) {
        if (
          exercise &&
          typeof exercise === 'object' &&
          !Array.isArray(exercise) &&
          typeof exercise.ejercicio_id === 'string'
        ) {
          ids.add(exercise.ejercicio_id);
        }
      }
    }
    return [...ids];
  }
}
