import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  DueRoutineDiagnostic,
  EvolutionDiagnosticsRepository,
  SaveEvolutionDiagnostic,
} from '../../application/ports/evolution-diagnostics.repository';

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PrismaEvolutionDiagnosticsRepository implements EvolutionDiagnosticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findDue(
    cutoff: Date,
    periodStart: Date,
  ): Promise<DueRoutineDiagnostic[]> {
    const versions = await this.prisma.routineVersion.findMany({
      where: {
        current: true,
        routine: { state: 'VIGENTE' },
        evolutionDiagnostics: { none: { calculatedAt: { gte: cutoff } } },
      },
      select: {
        id: true,
        routine: { select: { studentId: true } },
        days: {
          select: { exercises: { select: { exerciseId: true } } },
        },
        trainingSessions: {
          where: {
            occurredOn: { gte: periodStart },
            simulated: false,
            state: { in: ['COMPLETADA', 'BLOQUEADA'] },
          },
          orderBy: { occurredOn: 'asc' },
          select: {
            occurredOn: true,
            setRecords: {
              select: {
                prescribedExerciseId: true,
                warmup: true,
                completed: true,
                prescribedMaxRepetitions: true,
                performedRepetitions: true,
                performedLoad: true,
                perceivedEffort: true,
              },
            },
          },
        },
      },
    });

    return versions.map((version) => {
      const exerciseIds = [
        ...new Set(
          version.days.flatMap((day) =>
            day.exercises.map(({ exerciseId }) => exerciseId),
          ),
        ),
      ];
      return {
        studentId: version.routine.studentId,
        routineVersionId: version.id,
        exercises: exerciseIds.map((exerciseId) => ({
          exerciseId,
          sessions: version.trainingSessions
            .map((session) => ({
              occurredOn: session.occurredOn,
              sets: session.setRecords
                .filter((record) => record.prescribedExerciseId === exerciseId)
                .map((record) => ({
                  warmup: record.warmup,
                  completed: record.completed,
                  prescribedMaxRepetitions: record.prescribedMaxRepetitions,
                  performedRepetitions: record.performedRepetitions,
                  performedLoad:
                    record.performedLoad === null
                      ? null
                      : Number(record.performedLoad),
                  perceivedEffort: record.perceivedEffort,
                })),
            }))
            .filter((session) => session.sets.length > 0),
        })),
      };
    });
  }

  async saveIfDue(input: SaveEvolutionDiagnostic): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const recent = await tx.evolutionDiagnostic.findFirst({
        where: {
          routineVersionId: input.routineVersionId,
          calculatedAt: { gte: input.notBefore },
        },
        select: { id: true },
      });
      if (recent) return false;

      await tx.evolutionDiagnostic.create({
        data: {
          studentId: input.studentId,
          routineVersionId: input.routineVersionId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          globalSituation: input.globalSituation,
          adherence: input.adherence,
          componentVersion: 'evolution-diagnostic-v1',
          criteriaNotEvaluated: json(input.criteriaNotEvaluated),
          globalFindings: json(input.globalFindings),
          calculatedAt: input.calculatedAt,
          exerciseDiagnostics: {
            create: input.exercises.map((exercise) => ({
              exerciseId: exercise.exerciseId,
              situation: exercise.situation,
              metrics: json(exercise.metrics),
            })),
          },
        },
      });
      return true;
    });
  }
}
