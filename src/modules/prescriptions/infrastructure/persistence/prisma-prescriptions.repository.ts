import type { Prisma, PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  CreateRoutineCommand,
  PrescriptionsRepository,
  ReviewRoutineCommand,
  RoutineContent,
  RoutineSummary,
  RoutineTemplateSummary,
  TemplateContent,
} from '../../application/ports/prescriptions.repository';

/** Versiones ordenadas de la más nueva a la más vieja: la primera es la vigente. */
const ultimaVersion = {
  orderBy: { versionNumber: 'desc' },
  take: 1,
} satisfies Prisma.Routine$versionsArgs;

function toNumber(value: Prisma.Decimal): number {
  return Number(value);
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
                      select: { name: true, movementPattern: true },
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
      days: version.days.map((day) => ({
        position: day.position,
        name: day.name,
        dominantPattern: day.dominantPattern,
        exercises: day.exercises.map((exercise) => ({
          position: exercise.position,
          exerciseId: exercise.exerciseId,
          exerciseName: exercise.exercise.name,
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

  async review(command: ReviewRoutineCommand): Promise<void> {
    const aprueba = command.result !== 'RECHAZADA';

    await this.prisma.$transaction(async (tx) => {
      await tx.routineReview.create({
        data: {
          routineId: command.routineId,
          reviewedVersionId: command.versionId,
          reviewerTrainerId: command.reviewerTrainerId,
          result: command.result,
          observation: command.observation,
        },
      });

      if (!aprueba) {
        await tx.routine.update({
          where: { id: command.routineId },
          data: { state: 'RECHAZADA' },
        });
        return;
      }

      // El alumno no puede quedar con dos rutinas vigentes: la anterior se
      // archiva y su versión deja de ser la current.
      if (command.previousActiveRoutineId) {
        await tx.routine.update({
          where: { id: command.previousActiveRoutineId },
          data: { state: 'ARCHIVADA' },
        });
        await tx.routineVersion.updateMany({
          where: { routineId: command.previousActiveRoutineId },
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
    });
  }
}
