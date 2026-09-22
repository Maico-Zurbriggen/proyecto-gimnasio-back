import { Prisma, type PrismaClient } from '@prisma/client';

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

const VALIDATOR_VERSION = 'routine-generation-backend@1.0';
const LEVEL_RANK = { PRINCIPIANTE: 0, INTERMEDIO: 1, AVANZADO: 2 } as const;

interface Compatibility {
  state: 'COMPATIBLE' | 'ADVERTIDO';
  reason: string | null;
}

export class PrismaGeneratedRoutinesRepository implements GeneratedRoutinesRepository {
  constructor(private readonly prisma: PrismaClient) {}

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
    if (
      await this.prisma.routine.findFirst({
        where: { studentId: owner.studentId, state: 'PROPUESTA' },
        select: { id: true },
      })
    ) {
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

    const exerciseIds = this.extractExerciseIds(result.structuredOutput);
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
          result.structuredOutput,
          compatibleExercises.map((exercise) => ({
            id: exercise.id,
            movementPattern: exercise.movementPattern,
          })),
        )
      : {
          routine: null,
          violations: ['El servicio IA marcó la salida como inválida.'],
        };

    if (!validation.routine) {
      await this.saveInvalidValidation(result.id, validation.violations);
      throw new GeneratedRoutineInvalidError(validation.violations);
    }

    try {
      const routine = validation.routine;
      const created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.routine.findUnique({
          where: { sourceGenerationResultId: result.id },
          select: { id: true },
        });
        if (existing) return existing;
        if (
          await tx.routine.findFirst({
            where: { studentId: owner.studentId, state: 'PROPUESTA' },
            select: { id: true },
          })
        ) {
          throw new ProposedRoutineAlreadyExistsError();
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
                current: true,
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
                              suggestedLoad: new Prisma.Decimal(
                                set.suggestedLoad,
                              ),
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

  private extractExerciseIds(output: Prisma.JsonValue): string[] {
    if (!output || typeof output !== 'object' || Array.isArray(output))
      return [];
    const days = output.dias;
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
