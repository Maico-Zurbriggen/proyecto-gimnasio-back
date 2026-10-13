import type { Prisma, PrismaClient } from '@prisma/client';
import {
  assertGymExercisesAvailable,
  lockGymCatalog,
} from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import { CatalogError } from '../../../exercise-catalog/domain/catalog';
import { routineReviewToken } from './routine-review-token';

import { isUuid } from '../../../../shared/types/uuid';
import { requiresGoalConfirmation } from '../../../goals/domain/goal-policy';
import { resolveDominantPattern } from '../../domain/services/dominant-pattern';
import {
  GoalMismatchConfirmationError,
  RoutineNotFoundError,
  RoutineNotReviewableError,
  StudentNotFoundError,
  TemplateExerciseNotApprovedError,
  TemplateExerciseNotFoundError,
  TemplateFromAnotherGymError,
  TemplateInactiveError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import type {
  CreateRoutineCommand,
  PendingRoutineReview,
  PrescriptionsRepository,
  ReviewRoutineCommand,
  RoutineContent,
  RoutineSummary,
  RoutineTemplateDetail,
  RoutineTemplateSummary,
  TemplateContent,
  TemplateDayInput,
  TrainingPurpose,
  WriteTemplateCommand,
} from '../../application/ports/prescriptions.repository';

/** Versiones ordenadas de la más nueva a la más vieja: la primera es la vigente. */
const ultimaVersion = {
  orderBy: { versionNumber: 'desc' },
  take: 1,
} satisfies Prisma.Routine$versionsArgs;

function toNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value);
}

export class PrismaPrescriptionsRepository implements PrescriptionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listTemplatesForTrainer(
    trainerId: string,
  ): Promise<RoutineTemplateSummary[]> {
    if (!isUuid(trainerId)) {
      return [];
    }

    const trainer = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: { gymId: true },
    });
    if (!trainer) {
      return [];
    }

    const templates = await this.prisma.routineTemplate.findMany({
      where: { gymId: trainer.gymId, active: true },
      orderBy: { name: 'asc' },
      include: {
        days: { include: { _count: { select: { exercises: true } } } },
      },
    });

    return templates.map((template) => ({
      id: template.id,
      name: template.name,
      routineType: template.routineType,
      dayCount: template.days.length,
      exerciseCount: template.days.reduce(
        (total, day) => total + day._count.exercises,
        0,
      ),
    }));
  }

  async findTemplateDetail(
    trainerId: string,
    templateId: string,
  ): Promise<RoutineTemplateDetail | null> {
    if (!isUuid(trainerId) || !isUuid(templateId)) {
      return null;
    }
    const trainer = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: { gymId: true },
    });
    if (!trainer) {
      return null;
    }
    const template = await this.prisma.routineTemplate.findUnique({
      where: { id: templateId },
      include: {
        days: {
          orderBy: { position: 'asc' },
          include: {
            exercises: {
              orderBy: { position: 'asc' },
              include: {
                exercise: { select: { name: true, movementPattern: true } },
                sets: { orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!template) {
      return null;
    }
    if (template.gymId !== trainer.gymId) {
      throw new TemplateFromAnotherGymError();
    }
    return {
      id: template.id,
      gymId: template.gymId,
      authorTrainerId: template.authorTrainerId,
      name: template.name,
      routineType: template.routineType,
      active: template.active,
      days: template.days.map((day) => ({
        position: day.position,
        name: day.name,
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          position: exercise.position,
          note: exercise.note,
          exerciseName: exercise.exercise.name,
          movementPattern: exercise.exercise.movementPattern,
          sets: exercise.sets.map((set) => ({
            position: set.position,
            minRepetitions: set.minRepetitions,
            maxRepetitions: set.maxRepetitions,
            suggestedLoad: toNumber(set.suggestedLoad),
            restSeconds: set.restSeconds,
            warmup: set.warmup,
          })),
        })),
      })),
    };
  }

  /**
   * Los ejercicios de una plantilla deben estar aprobados en el gimnasio
   * (base o propios). No se exige habilitación: la disponibilidad puede
   * cambiar después y se comprueba al asignar (assertGymExercisesAvailable).
   */
  private async assertTemplateExercises(
    tx: Prisma.TransactionClient,
    gymId: string,
    exerciseIds: string[],
  ): Promise<void> {
    const ids = [...new Set(exerciseIds)];
    const rows = await tx.exercise.findMany({
      where: {
        id: { in: ids },
        OR: [
          { gymId: null, origin: 'CATALOGO_BASE' },
          { gymId, origin: 'GIMNASIO' },
        ],
      },
      select: { id: true, state: true },
    });
    if (rows.length !== ids.length) {
      throw new TemplateExerciseNotFoundError();
    }
    if (rows.some((row) => row.state !== 'APROBADO')) {
      throw new TemplateExerciseNotApprovedError();
    }
  }

  private templateDaysData(command: WriteTemplateCommand) {
    return command.days.map((day, dayIndex) => ({
      position: dayIndex + 1,
      name: day.name,
      exercises: {
        create: day.exercises.map((exercise, exerciseIndex) => ({
          exerciseId: exercise.exerciseId,
          position: exerciseIndex + 1,
          note: exercise.note,
          sets: {
            create: exercise.sets.map((set, setIndex) => ({
              position: setIndex + 1,
              minRepetitions: set.minRepetitions,
              maxRepetitions: set.maxRepetitions,
              suggestedLoad: set.suggestedLoad,
              restSeconds: set.restSeconds,
              warmup: set.warmup,
            })),
          },
        })),
      },
    }));
  }

  private async requireTrainerGym(
    tx: Prisma.TransactionClient,
    trainerId: string,
  ): Promise<string> {
    const trainer = await tx.user.findUnique({
      where: { id: trainerId },
      select: { gymId: true },
    });
    if (!trainer) {
      throw new TemplateNotFoundError('El entrenador no existe');
    }
    return trainer.gymId;
  }

  async createTemplate(
    trainerId: string,
    command: WriteTemplateCommand,
  ): Promise<{ templateId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const gymId = await this.requireTrainerGym(tx, trainerId);
      await lockGymCatalog(tx, gymId);
      await this.assertTemplateExercises(
        tx,
        gymId,
        command.days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        ),
      );
      const template = await tx.routineTemplate.create({
        data: {
          gymId,
          authorTrainerId: trainerId,
          name: command.name,
          routineType: command.routineType,
          days: { create: this.templateDaysData(command) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: trainerId,
          operation: 'ROUTINE_TEMPLATE_CREATED',
          entityType: 'ROUTINE_TEMPLATE',
          entityId: template.id,
          newValue: { name: command.name, routineType: command.routineType },
        },
      });
      return { templateId: template.id };
    });
  }

  async updateTemplate(
    trainerId: string,
    templateId: string,
    command: WriteTemplateCommand,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const gymId = await this.requireTrainerGym(tx, trainerId);
      await lockGymCatalog(tx, gymId);
      const current = await tx.routineTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, gymId: true, active: true },
      });
      if (!current) {
        throw new TemplateNotFoundError();
      }
      if (current.gymId !== gymId) {
        throw new TemplateFromAnotherGymError();
      }
      if (!current.active) {
        throw new TemplateInactiveError();
      }
      await this.assertTemplateExercises(
        tx,
        gymId,
        command.days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        ),
      );
      await tx.templateDay.deleteMany({ where: { templateId } });
      await tx.routineTemplate.update({
        where: { id: templateId },
        data: {
          name: command.name,
          routineType: command.routineType,
          days: { create: this.templateDaysData(command) },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: trainerId,
          operation: 'ROUTINE_TEMPLATE_UPDATED',
          entityType: 'ROUTINE_TEMPLATE',
          entityId: templateId,
          newValue: { name: command.name, routineType: command.routineType },
        },
      });
    });
  }

  async setTemplateActive(
    trainerId: string,
    templateId: string,
    active: boolean,
  ): Promise<{ active: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const gymId = await this.requireTrainerGym(tx, trainerId);
      await lockGymCatalog(tx, gymId);
      const current = await tx.routineTemplate.findUnique({
        where: { id: templateId },
        select: { id: true, gymId: true, active: true },
      });
      if (!current) {
        throw new TemplateNotFoundError();
      }
      if (current.gymId !== gymId) {
        throw new TemplateFromAnotherGymError();
      }
      if (current.active === active) {
        return { active };
      }
      await tx.routineTemplate.update({
        where: { id: templateId },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: trainerId,
          operation: active
            ? 'ROUTINE_TEMPLATE_ACTIVATED'
            : 'ROUTINE_TEMPLATE_DEACTIVATED',
          entityType: 'ROUTINE_TEMPLATE',
          entityId: templateId,
          newValue: { active },
        },
      });
      return { active };
    });
  }

  async findTemplateContent(
    templateId: string,
  ): Promise<TemplateContent | null> {
    if (!isUuid(templateId)) {
      return null;
    }

    const template = await this.prisma.routineTemplate.findFirst({
      where: { id: templateId, active: true },
      include: {
        days: {
          orderBy: { position: 'asc' },
          include: {
            exercises: {
              orderBy: { position: 'asc' },
              include: {
                exercise: { select: { movementPattern: true } },
                sets: { orderBy: { position: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (!template) {
      return null;
    }

    return {
      id: template.id,
      gymId: template.gymId,
      routineType: template.routineType,
      days: template.days.map((day) => ({
        position: day.position,
        name: day.name,
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          position: exercise.position,
          note: exercise.note,
          movementPattern: exercise.exercise.movementPattern,
          sets: exercise.sets.map((set) => ({
            position: set.position,
            minRepetitions: set.minRepetitions,
            maxRepetitions: set.maxRepetitions,
            suggestedLoad: toNumber(set.suggestedLoad),
            restSeconds: set.restSeconds,
            warmup: set.warmup,
          })),
        })),
      })),
    };
  }

  async findStudentGymId(studentId: string): Promise<string | null> {
    if (!isUuid(studentId)) {
      return null;
    }

    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { user: { select: { gymId: true } } },
    });
    return student?.user.gymId ?? null;
  }

  async createProposedRoutine(
    command: CreateRoutineCommand,
  ): Promise<{ routineId: string; versionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.user.findUniqueOrThrow({
        where: { id: command.studentId },
        select: { gymId: true },
      });
      await lockGymCatalog(tx, student.gymId);
      await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${command.studentId}::uuid FOR UPDATE`;
      const source = await tx.routineTemplate.findFirst({
        where: {
          id: command.sourceTemplateId,
          gymId: student.gymId,
          active: true,
        },
      });
      if (!source) throw new CatalogError('template_not_found', 404);
      if (
        await tx.routine.count({
          where: { studentId: command.studentId, state: 'PROPUESTA' },
        })
      )
        throw new CatalogError('pending_proposal', 409);
      const assignment = await tx.trainerStudentAssignment.findFirst({
        where: {
          trainerId: command.requestedByUserId,
          studentId: command.studentId,
          startsAt: { lte: new Date() },
          endsAt: null,
        },
      });
      if (!assignment) throw new CatalogError('trainer_not_assigned', 403);
      await assertGymExercisesAvailable(
        tx,
        student.gymId,
        command.days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        ),
      );
      const routine = await tx.routine.create({
        data: {
          studentId: command.studentId,
          sourceTemplateId: command.sourceTemplateId,
          routineType: command.routineType,
          targetWeeklyFrequency: command.targetWeeklyFrequency,
          state: 'PROPUESTA',
          origin: 'PLANTILLA_ENTRENADOR',
          requestedByUserId: command.requestedByUserId,
        },
        select: { id: true },
      });

      // `current` queda en false: la versión recién rige cuando el entrenador
      // aprueba la rutina (RF-110).
      const version = await tx.routineVersion.create({
        data: {
          routineId: routine.id,
          versionNumber: 1,
          current: false,
          createdByUserId: command.requestedByUserId,
        },
        select: { id: true },
      });

      for (const day of command.days) {
        await tx.routineDay.create({
          data: {
            routineVersionId: version.id,
            position: day.position,
            name: day.name,
            dominantPattern: day.dominantPattern,
            exercises: {
              create: day.exercises.map((exercise) => ({
                exerciseId: exercise.exerciseId,
                position: exercise.position,
                note: exercise.note,
                sets: { create: exercise.sets },
              })),
            },
          },
        });
      }

      return { routineId: routine.id, versionId: version.id };
    });
  }

  async createManualRoutine(command: {
    trainerId: string;
    studentId: string;
    routineType: TrainingPurpose;
    days: TemplateDayInput[];
  }): Promise<{ routineId: string; versionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const trainer = await tx.user.findUnique({
        where: { id: command.trainerId },
        select: { gymId: true },
      });
      if (!trainer) {
        throw new TemplateNotFoundError('El entrenador no existe');
      }
      const student = await tx.user.findUnique({
        where: { id: command.studentId },
        select: { gymId: true },
      });
      if (!student) {
        throw new StudentNotFoundError();
      }
      if (student.gymId !== trainer.gymId) {
        throw new TemplateFromAnotherGymError();
      }
      await lockGymCatalog(tx, student.gymId);
      await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${command.studentId}::uuid FOR UPDATE`;
      const exerciseIds = command.days.flatMap((day) =>
        day.exercises.map((exercise) => exercise.exerciseId),
      );
      await assertGymExercisesAvailable(tx, student.gymId, exerciseIds);
      const patterns = await tx.exercise.findMany({
        where: { id: { in: [...new Set(exerciseIds)] } },
        select: { id: true, movementPattern: true },
      });
      const patternById = new Map(
        patterns.map((row) => [row.id, row.movementPattern]),
      );
      const days = command.days.map((day, dayIndex) => {
        const exercises = day.exercises.map((exercise, exerciseIndex) => ({
          exerciseId: exercise.exerciseId,
          position: exerciseIndex + 1,
          note: exercise.note,
          movementPattern: patternById.get(exercise.exerciseId) ?? 'CORE',
          sets: exercise.sets.map((set, setIndex) => ({
            position: setIndex + 1,
            minRepetitions: set.minRepetitions,
            maxRepetitions: set.maxRepetitions,
            suggestedLoad: set.suggestedLoad,
            restSeconds: set.restSeconds,
            warmup: set.warmup,
          })),
        }));
        return {
          position: dayIndex + 1,
          name: day.name,
          dominantPattern: resolveDominantPattern({
            position: dayIndex + 1,
            name: day.name,
            exercises,
          }),
          exercises: exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            position: exercise.position,
            note: exercise.note,
            sets: exercise.sets,
          })),
        };
      });
      const routine = await tx.routine.create({
        data: {
          studentId: command.studentId,
          routineType: command.routineType,
          targetWeeklyFrequency: days.length,
          state: 'PROPUESTA',
          origin: 'PLANTILLA_ENTRENADOR',
          requestedByUserId: command.trainerId,
        },
        select: { id: true },
      });
      const version = await tx.routineVersion.create({
        data: {
          routineId: routine.id,
          versionNumber: 1,
          current: false,
          createdByUserId: command.trainerId,
        },
        select: { id: true },
      });
      for (const day of days) {
        await tx.routineDay.create({
          data: {
            routineVersionId: version.id,
            position: day.position,
            name: day.name,
            dominantPattern: day.dominantPattern,
            exercises: {
              create: day.exercises.map((exercise) => ({
                exerciseId: exercise.exerciseId,
                position: exercise.position,
                note: exercise.note,
                sets: { create: exercise.sets },
              })),
            },
          },
        });
      }
      return { routineId: routine.id, versionId: version.id };
    });
  }

  async listByStudent(studentId: string): Promise<RoutineSummary[]> {
    if (!isUuid(studentId)) {
      return [];
    }

    const routines = await this.prisma.routine.findMany({
      where: { studentId },
      orderBy: { requestedAt: 'desc' },
      include: { versions: ultimaVersion },
    });

    return routines.flatMap((routine) => {
      const version = routine.versions[0];
      // Una rutina sin versión es un dato incompleto, no una rutina: no se lista.
      if (!version) {
        return [];
      }
      return [
        {
          id: routine.id,
          studentId: routine.studentId,
          routineType: routine.routineType,
          state: routine.state,
          origin: routine.origin,
          targetWeeklyFrequency: routine.targetWeeklyFrequency,
          requestedAt: routine.requestedAt,
          versionId: version.id,
          versionNumber: version.versionNumber,
        },
      ];
    });
  }

  async findContent(
    studentId: string,
    routineId: string,
  ): Promise<RoutineContent | null> {
    if (!isUuid(studentId) || !isUuid(routineId)) {
      return null;
    }

    const routine = await this.prisma.routine.findFirst({
      where: { id: routineId, studentId },
      include: {
        sourceGenerationResult: {
          select: {
            structuredOutput: true,
            attempt: { select: { request: { select: { preferences: true } } } },
          },
        },
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            days: {
              orderBy: { position: 'asc' },
              include: {
                exercises: {
                  orderBy: { position: 'asc' },
                  include: {
                    exercise: {
                      select: {
                        name: true,
                        movementPattern: true,
                        state: true,
                        availability: {
                          where: {
                            gym: { users: { some: { id: studentId } } },
                          },
                          select: { enabled: true },
                        },
                      },
                    },
                    sets: { orderBy: { position: 'asc' } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const version = routine?.versions[0];
    if (!routine || !version) {
      return null;
    }

    const preferences =
      routine.sourceGenerationResult?.attempt.request.preferences;
    const generationPrompt =
      preferences &&
      typeof preferences === 'object' &&
      !Array.isArray(preferences) &&
      typeof preferences.free_text === 'string'
        ? preferences.free_text
        : null;

    const output = routine.sourceGenerationResult?.structuredOutput;
    const explanation =
      output &&
      typeof output === 'object' &&
      !Array.isArray(output) &&
      typeof output.explanation === 'string'
        ? output.explanation
        : null;
    const warnings =
      output &&
      typeof output === 'object' &&
      !Array.isArray(output) &&
      Array.isArray(output.warnings)
        ? output.warnings.filter(
            (value): value is string => typeof value === 'string',
          )
        : [];
    return {
      id: routine.id,
      studentId: routine.studentId,
      routineType: routine.routineType,
      state: routine.state,
      origin: routine.origin,
      targetWeeklyFrequency: routine.targetWeeklyFrequency,
      requestedAt: routine.requestedAt,
      versionId: version.id,
      versionNumber: version.versionNumber,
      generationPrompt,
      generationExplanation: explanation,
      generationWarnings: warnings,
      ...(routine.state === 'PROPUESTA'
        ? {
            reviewToken: await routineReviewToken(
              this.prisma,
              studentId,
              version.id,
              version.days.flatMap((day) =>
                day.exercises.map((exercise) => exercise.exerciseId),
              ),
            ),
          }
        : {}),
      days: version.days.map((day) => ({
        position: day.position,
        name: day.name,
        dominantPattern: day.dominantPattern,
        exercises: day.exercises.map((exercise) => ({
          position: exercise.position,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exercise.name,
          available:
            exercise.exercise.state === 'APROBADO' &&
            (exercise.exercise.availability[0]?.enabled ?? false),
          movementPattern: exercise.exercise.movementPattern,
          note: exercise.note,
          sets: exercise.sets.map((set) => ({
            position: set.position,
            minRepetitions: set.minRepetitions,
            maxRepetitions: set.maxRepetitions,
            suggestedLoad: toNumber(set.suggestedLoad),
            restSeconds: set.restSeconds,
            warmup: set.warmup,
          })),
        })),
      })),
    };
  }

  async review(
    command: ReviewRoutineCommand,
  ): Promise<{ archivedRoutineId: string | null }> {
    const aprueba = command.result !== 'RECHAZADA';

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.routine.findUniqueOrThrow({
        where: { id: command.routineId },
        select: {
          studentId: true,
          student: { select: { user: { select: { gymId: true } } } },
        },
      });
      if (before.studentId !== command.studentId) {
        throw new RoutineNotFoundError();
      }
      await lockGymCatalog(tx, before.student.user.gymId);
      await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${before.studentId}::uuid FOR UPDATE`;
       const current = await tx.routine.findUniqueOrThrow({
        where: { id: command.routineId },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' },
            take: 1,
            include: { days: { include: { exercises: true } } },
          },
        },
      });
       if (current.state !== 'PROPUESTA') {
         throw new RoutineNotReviewableError();
       }
       if (current.versions[0]?.id !== command.versionId) {
         throw new CatalogError('routine_review_conflict', 409);
       }
       const goal = await tx.goal.findFirst({
         where: { studentId: before.studentId, endsOn: null },
       });
       if (
         aprueba &&
         requiresGoalConfirmation(current.routineType, goal?.type ?? null) &&
         !command.confirmGoalMismatch
       ) {
         throw new GoalMismatchConfirmationError();
       }
      const assignment = await tx.trainerStudentAssignment.findFirst({
        where: {
          trainerId: command.reviewerTrainerId,
          studentId: before.studentId,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
        },
      });
      if (!assignment) throw new CatalogError('trainer_not_assigned', 403);
      if (aprueba) {
        const ids = current.versions[0]!.days.flatMap((day) =>
          day.exercises.map((exercise) => exercise.exerciseId),
        );
        await assertGymExercisesAvailable(tx, before.student.user.gymId, ids);
        const token = await routineReviewToken(
          tx,
          before.studentId,
          command.versionId,
          ids,
        );
        if (!command.reviewToken || token !== command.reviewToken)
          throw new CatalogError('routine_review_conflict', 409);
      }
      await tx.routineReview.create({
        data: {
          routineId: command.routineId,
          reviewedVersionId: command.versionId,
          reviewerTrainerId: command.reviewerTrainerId,
          result: command.result,
          observation: command.observation,
        },
      });

      const persistDecisionSideEffects = async (
        archivedRoutineId: string | null,
      ) => {
        await tx.notice.updateMany({
          where: {
            referenceType: 'ROUTINE',
            referenceId: command.routineId,
            type: 'RUTINA_PROPUESTA_PENDIENTE',
            expired: false,
          },
          data: { expired: true },
        });
        await tx.notice.create({
          data: {
            recipientUserId: before.studentId,
            type: aprueba ? 'RUTINA_EN_VIGENCIA' : 'RUTINA_RECHAZADA',
            referenceType: 'ROUTINE',
            referenceId: command.routineId,
            text: aprueba
              ? 'Tu entrenador aprobÃ³ tu nueva rutina: ya estÃ¡ vigente.'
              : `Tu entrenador rechazÃ³ la rutina propuesta. Motivo: ${command.observation ?? ''}`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: command.reviewerTrainerId,
            operation: aprueba ? 'APROBACION_RUTINA' : 'RECHAZO_RUTINA',
            entityType: 'ROUTINE',
            entityId: command.routineId,
            previousValue: { estado: 'PROPUESTA' },
            newValue: {
              estado: aprueba ? 'VIGENTE' : 'RECHAZADA',
              resultado: command.result,
              versionRevisada: command.versionId,
              observacion: command.observation,
              rutinaArchivada: archivedRoutineId,
            },
          },
        });
      };

      if (!aprueba) {
        await tx.routine.update({
          where: { id: command.routineId },
          data: { state: 'RECHAZADA' },
        });
        await persistDecisionSideEffects(null);
        return { archivedRoutineId: null };
      }

      // El alumno no puede quedar con dos rutinas vigentes: la anterior se
      // archiva y su versión deja de ser la current.
      const previous = await tx.routine.findMany({
        where: { studentId: before.studentId, state: 'VIGENTE' },
        select: { id: true },
      });
      if (previous.length) {
        await tx.routine.updateMany({
          where: { id: { in: previous.map((item) => item.id) } },
          data: { state: 'ARCHIVADA' },
        });
        await tx.routineVersion.updateMany({
          where: { routineId: { in: previous.map((item) => item.id) } },
          data: { current: false },
        });
      }

      await tx.routine.update({
        where: { id: command.routineId },
        data: { state: 'VIGENTE' },
      });
      await tx.routineVersion.update({
        where: { id: command.versionId },
        data: { current: true },
      });
      await tx.routineExercise.updateMany({
        where: { routineDay: { routineVersionId: command.versionId } },
        data: { compatibilityState: 'COMPATIBLE', compatibilityReason: null },
      });
      const archivedRoutineId = previous[0]?.id ?? null;
      await persistDecisionSideEffects(archivedRoutineId);
      return { archivedRoutineId };
    });
  }

  async listPendingReviewsForTrainer(
    trainerId: string,
  ): Promise<PendingRoutineReview[]> {
    if (!isUuid(trainerId)) return [];
    const trainer = await this.prisma.user.findUnique({
      where: { id: trainerId },
      select: { gymId: true },
    });
    if (!trainer) return [];

    const now = new Date();
    const routines = await this.prisma.routine.findMany({
      where: {
        state: 'PROPUESTA',
        student: {
          user: { gymId: trainer.gymId },
          trainerAssignments: {
            some: {
              trainerId,
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
          },
        },
      },
      orderBy: { requestedAt: 'asc' },
      include: {
        requestedBy: { select: { displayName: true } },
        student: {
          select: {
            user: { select: { displayName: true } },
            goals: {
              where: { endsOn: null },
              select: { type: true },
              take: 1,
            },
            routines: {
              where: { state: 'VIGENTE' },
              select: { id: true },
              take: 1,
            },
          },
        },
        versions: {
          ...ultimaVersion,
          include: {
            days: { include: { _count: { select: { exercises: true } } } },
          },
        },
      },
    });

    return routines.flatMap((routine) => {
      const version = routine.versions[0];
      if (!version) return [];
      return [
        {
          routineId: routine.id,
          studentId: routine.studentId,
          studentName: routine.student.user.displayName,
          routineType: routine.routineType,
          origin: routine.origin,
          targetWeeklyFrequency: routine.targetWeeklyFrequency,
          requestedAt: routine.requestedAt,
          requestedByName: routine.requestedBy?.displayName ?? null,
          requestedByStudent: routine.requestedByUserId === routine.studentId,
          versionId: version.id,
          versionNumber: version.versionNumber,
          dayCount: version.days.length,
          exerciseCount: version.days.reduce(
            (total, day) => total + day._count.exercises,
            0,
          ),
          currentGoal: routine.student.goals[0]?.type ?? null,
          replacesActiveRoutine: routine.student.routines.length > 0,
        },
      ];
    });
  }
}
