import { Prisma, type PrismaClient } from '@prisma/client';
import {
  lockGymCatalog,
  assertGymExercisesAvailable,
} from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import type { TrainingPurpose } from '../../../routine-generations/domain/services/generated-routine-validator';
import type {
  AdaptationDemoActor,
  AdaptationDemoRepository,
  AdaptationDemoResult,
  AdaptationDemoStudent,
} from '../../application/ports/adaptation-demo.repository';
import { calculateAdaptationDemo } from '../../application/use-cases/calculate-adaptation-demo.use-case';
import {
  AdaptationDemoError,
  ADAPTATION_DEMO_PLAN_VERSION,
  buildAdaptationDemoPlan,
  type AdaptationDemoScenario,
} from '../../domain/services/adaptation-demo';
import { adaptationDemoResultSchema } from '../http/adaptation-demo.schemas';
import { PrismaEvolutionDiagnosticsRepository } from './prisma-evolution-diagnostics.repository';
import { PrismaAdjustmentProposalsRepository } from './prisma-adjustment-proposals.repository';

type Transaction = Prisma.TransactionClient;
const runInclude = {
  preparedRoutine: {
    include: { versions: { where: { current: true }, select: { id: true } } },
  },
} as const;
type Run = Prisma.AdaptationDemoRunGetPayload<{ include: typeof runInclude }>;
const dayMs = 86_400_000;
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

function parseResult(value: Prisma.JsonValue | null): AdaptationDemoResult {
  const parsed = adaptationDemoResultSchema.safeParse(value);
  if (!parsed.success)
    throw new AdaptationDemoError('demo_restore_point_invalid', 409);
  return parsed.data;
}

/** Uses existing students and catalogue. Only a tagged working routine is archived on restore. */
export class PrismaAdaptationDemoRepository implements AdaptationDemoRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(actor: AdaptationDemoActor): Promise<AdaptationDemoStudent[]> {
    const students = await this.prisma.studentProfile.findMany({
      where: {
        user: { gymId: actor.gymId, state: 'ACTIVO' },
        trainerAssignments: {
          some: {
            trainerId: actor.trainerId,
            endsAt: null,
            startsAt: { lte: new Date() },
          },
        },
      },
      include: {
        user: { select: { displayName: true } },
        routines: { where: { state: 'VIGENTE' }, select: { id: true } },
        adaptationDemoRuns: {
          where: { restoredAt: null },
          include: runInclude,
        },
      },
      orderBy: { user: { displayName: 'asc' } },
    });
    const proposalIds = students.flatMap((student) =>
      student.adaptationDemoRuns.flatMap((run) => {
        const result = parseResult(run.result);
        return result.proposalId ? [result.proposalId] : [];
      }),
    );
    const proposals = await this.prisma.adaptationProposal.findMany({
      where: { id: { in: proposalIds } },
      select: { id: true, state: true },
    });
    const states = new Map(
      proposals.map((proposal) => [proposal.id, proposal.state]),
    );
    return students.map((student) => {
      const run = student.adaptationDemoRuns[0];
      const result = run ? parseResult(run.result) : null;
      return {
        studentId: student.userId,
        displayName: student.user.displayName,
        hasCurrentRoutine: student.routines.length > 0,
        activeRun: result
          ? {
              ...result,
              proposalState: result.proposalId
                ? (states.get(result.proposalId) ?? null)
                : null,
            }
          : null,
      };
    });
  }

  private async lockStudent(
    tx: Transaction,
    actor: AdaptationDemoActor,
    studentId: string,
    now: Date,
  ) {
    await lockGymCatalog(tx, actor.gymId);
    await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;
    const assignment = await tx.trainerStudentAssignment.findFirst({
      where: {
        studentId,
        trainerId: actor.trainerId,
        endsAt: null,
        startsAt: { lte: now },
        student: { user: { gymId: actor.gymId, state: 'ACTIVO' } },
        trainer: { user: { gymId: actor.gymId, state: 'ACTIVO' } },
      },
      select: { id: true },
    });
    if (!assignment)
      throw new AdaptationDemoError('forbidden_not_assigned', 403);
    if (
      await tx.trainingSession.count({
        where: { studentId, state: 'EN_CURSO' },
      })
    )
      throw new AdaptationDemoError('demo_training_in_progress', 409);
  }

  private async audit(
    tx: Transaction,
    actor: AdaptationDemoActor,
    runId: string,
    operation: string,
    data: Record<string, unknown>,
  ) {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.trainerId,
        operation,
        entityType: 'ADAPTATION_DEMO',
        entityId: runId,
        previousValue: Prisma.JsonNull,
        newValue: data as Prisma.InputJsonValue,
      },
    });
  }

  private async restoreRun(
    tx: Transaction,
    actor: AdaptationDemoActor,
    run: Run,
    now: Date,
  ) {
    const current = await tx.routine.findFirst({
      where: { studentId: run.studentId, state: 'VIGENTE' },
      select: { id: true },
    });
    const original = await tx.routineVersion.findUnique({
      where: { id: run.originalVersionId },
      include: { routine: true },
    });
    if (
      !run.preparedRoutine ||
      (current && current.id !== run.preparedRoutine.id) ||
      !original?.current ||
      original.routineId !== run.originalRoutineId ||
      original.routine.state !== 'ARCHIVADA'
    )
      throw new AdaptationDemoError('demo_restore_conflict', 409);
    // Preserve any actual training recorded by another window during the presentation.
    if (
      await tx.trainingSession.count({
        where: { routineId: run.preparedRoutine.id, simulated: false },
      })
    )
      throw new AdaptationDemoError('demo_has_new_training', 409);
    const proposals = await tx.adaptationProposal.findMany({
      where: {
        diagnostic: { routineVersion: { routineId: run.preparedRoutine.id } },
      },
      select: { id: true },
    });
    const proposalIds = proposals.map((proposal) => proposal.id);
    if (
      await tx.routineProposalRegeneration.count({
        where: { proposalId: { in: proposalIds }, state: 'PENDIENTE' },
      })
    )
      throw new AdaptationDemoError('demo_regeneration_pending', 409);
    await tx.proposedAdjustment.updateMany({
      where: { proposalId: { in: proposalIds }, state: 'PENDIENTE' },
      data: { state: 'RECHAZADO' },
    });
    await tx.adaptationProposal.updateMany({
      where: {
        id: { in: proposalIds },
        state: { in: ['PENDIENTE', 'BLOQUEADA'] },
      },
      data: {
        state: 'INVALIDADA',
        resolvedAt: now,
        resolvedByTrainerId: actor.trainerId,
        resolutionReason: 'Preparación de demostración restaurada.',
      },
    });
    await tx.notice.updateMany({
      where: {
        OR: [
          {
            referenceType: 'ADAPTATION_PROPOSAL',
            referenceId: { in: proposalIds },
          },
          { referenceType: 'ROUTINE', referenceId: run.preparedRoutine.id },
        ],
      },
      data: { expired: true },
    });
    await tx.routine.update({
      where: { id: run.preparedRoutine.id },
      data: { state: 'ARCHIVADA' },
    });
    await tx.routine.update({
      where: { id: run.originalRoutineId },
      data: { state: 'VIGENTE' },
    });
    await tx.adaptationDemoRun.update({
      where: { id: run.id },
      data: { restoredAt: now },
    });
    await this.audit(tx, actor, run.id, 'RESTAURACION_DEMO_ADAPTACION', {
      studentId: run.studentId,
      originalRoutineId: run.originalRoutineId,
    });
  }

  async restore(actor: AdaptationDemoActor, studentId: string, now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockStudent(tx, actor, studentId, now);
        const run = await tx.adaptationDemoRun.findFirst({
          where: { studentId, restoredAt: null },
          include: runInclude,
        });
        if (!run) return { restored: false };
        await this.restoreRun(tx, actor, run, now);
        return { restored: true };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  }

  async prepare(
    actor: AdaptationDemoActor,
    studentId: string,
    scenario: AdaptationDemoScenario,
    now: Date,
  ): Promise<AdaptationDemoResult> {
    return this.prisma.$transaction(
      async (tx) => {
        await this.lockStudent(tx, actor, studentId, now);
        const periodEnd = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
        const previous = await tx.adaptationDemoRun.findFirst({
          where: { studentId, restoredAt: null },
          include: runInclude,
        });
        if (previous) {
          const saved = parseResult(previous.result);
          const proposal = saved.proposalId
            ? await tx.adaptationProposal.findUnique({
                where: { id: saved.proposalId },
                select: { state: true },
              })
            : null;
          const unchanged =
            previous.preparedRoutine?.state === 'VIGENTE' &&
            previous.preparedRoutine.versions[0]?.id ===
              (
                await tx.evolutionDiagnostic.findUnique({
                  where: { id: saved.diagnosticId },
                  select: { routineVersionId: true },
                })
              )?.routineVersionId;
          if (
            previous.scenario === scenario &&
            (previous.result as Record<string, unknown> | null)
              ?.preparationVersion === ADAPTATION_DEMO_PLAN_VERSION &&
            dateOnly(previous.preparedOn) === dateOnly(periodEnd) &&
            unchanged &&
            (!saved.proposalId || proposal?.state === 'PENDIENTE')
          )
            return {
              ...saved,
              reused: true,
              proposalState: proposal?.state ?? null,
            };
          await this.restoreRun(tx, actor, previous, now);
        }
        const source = await tx.routine.findFirst({
          where: { studentId, state: 'VIGENTE', demoRunId: null },
          include: {
            versions: {
              where: { current: true },
              include: {
                days: {
                  orderBy: { position: 'asc' },
                  include: {
                    exercises: {
                      orderBy: { position: 'asc' },
                      include: { exercise: true },
                    },
                  },
                },
              },
            },
          },
        });
        const sourceVersion = source?.versions[0];
        if (
          !source ||
          !sourceVersion ||
          !sourceVersion.days.length ||
          sourceVersion.days.some((day) => !day.exercises.length)
        )
          throw new AdaptationDemoError('demo_current_routine_required', 409);
        const sourceExercises = sourceVersion.days.flatMap(
          (day) => day.exercises,
        );
        if (sourceExercises.length > 60 || sourceVersion.days.length > 7)
          throw new AdaptationDemoError('demo_routine_too_large', 409);
        if (
          sourceExercises.some((exercise) =>
            ['INCOMPATIBLE', 'EJERCICIO_DESACTIVADO'].includes(
              exercise.compatibilityState,
            ),
          )
        )
          throw new AdaptationDemoError('demo_incompatible_exercise', 409);
        await assertGymExercisesAvailable(
          tx,
          actor.gymId,
          sourceExercises.map((exercise) => exercise.exerciseId),
        );
        const exerciseIndexes = new Map(
          [
            ...new Set(sourceExercises.map((exercise) => exercise.exerciseId)),
          ].map((exerciseId, index) => [exerciseId, index]),
        );
        const run = await tx.adaptationDemoRun.create({
          data: {
            studentId,
            trainerId: actor.trainerId,
            scenario,
            originalRoutineId: source.id,
            originalVersionId: sourceVersion.id,
            preparedOn: periodEnd,
            createdAt: now,
          },
        });
        await tx.routine.update({
          where: { id: source.id },
          data: { state: 'ARCHIVADA' },
        });
        const routine = await tx.routine.create({
          data: {
            studentId,
            routineType: source.routineType,
            targetWeeklyFrequency: source.targetWeeklyFrequency,
            state: 'VIGENTE',
            origin: 'DEMOSTRACION',
            requestedByUserId: actor.trainerId,
            requestedAt: new Date(periodEnd.getTime() - 60 * dayMs),
            demoRunId: run.id,
          },
        });
        const version = await tx.routineVersion.create({
          data: {
            routineId: routine.id,
            versionNumber: 1,
            current: true,
            createdByUserId: actor.trainerId,
            createdAt: new Date(periodEnd.getTime() - 60 * dayMs),
          },
        });
        const gym = await tx.gym.findUniqueOrThrow({
          where: { id: actor.gymId },
          select: { timezone: true },
        });
        for (const [dayIndex, sourceDay] of sourceVersion.days.entries()) {
          const exercisePlans = sourceDay.exercises.map((exercise) => ({
            exercise,
            plan: buildAdaptationDemoPlan(
              scenario,
              source.routineType as TrainingPurpose,
              periodEnd,
              {
                exerciseIndex: exerciseIndexes.get(exercise.exerciseId)!,
                dayIndex,
              },
            ),
          }));
          const preparedDay = await tx.routineDay.create({
            data: {
              routineVersionId: version.id,
              position: sourceDay.position,
              name: sourceDay.name,
              dominantPattern: sourceDay.dominantPattern,
              exercises: {
                create: exercisePlans.map(({ exercise, plan }) => ({
                  exerciseId: exercise.exerciseId,
                  position: exercise.position,
                  note: exercise.note,
                  compatibilityState: exercise.compatibilityState,
                  compatibilityReason: exercise.compatibilityReason,
                  sets: { create: plan.sets },
                })),
              },
            },
          });
          if (scenario === 'DATOS_INSUFICIENTES' && dayIndex > 0) continue;
          for (const [
            sessionIndex,
            session,
          ] of exercisePlans[0]!.plan.sessions.entries()) {
            let position = 0;
            const startedAt = new Date(
              session.occurredOn.getTime() + (12 + dayIndex) * 3_600_000,
            );
            await tx.trainingSession.create({
              data: {
                studentId,
                routineId: routine.id,
                routineVersionId: version.id,
                routineDayId: preparedDay.id,
                state: 'BLOQUEADA',
                simulated: true,
                occurredOn: session.occurredOn,
                startedAt,
                completedAt: new Date(startedAt.getTime() + 3_600_000),
                lastActivityAt: new Date(startedAt.getTime() + 3_600_000),
                snapshotComplete: true,
                dayNameSnapshot: sourceDay.name,
                dayPositionSnapshot: sourceDay.position,
                versionNumberSnapshot: 1,
                timezoneSnapshot: gym.timezone,
                setRecords: {
                  create: exercisePlans.flatMap(({ exercise, plan }) =>
                    plan.sessions[sessionIndex]!.series.map(
                      (series, setIndex) => ({
                        position: ++position,
                        prescribedExerciseId: exercise.exerciseId,
                        performedExerciseId: exercise.exerciseId,
                        prescribedMinRepetitions:
                          plan.sets[setIndex]!.minRepetitions,
                        prescribedMaxRepetitions:
                          series.prescribedMaxRepetitions,
                        prescribedLoad: plan.sets[setIndex]!.suggestedLoad,
                        prescribedExerciseName: exercise.exercise.name,
                        prescribedExercisePosition: exercise.position,
                        prescribedSetPosition: setIndex + 1,
                        prescribedRestSeconds: plan.sets[setIndex]!.restSeconds,
                        prescribedNote: exercise.note,
                        performedExerciseName: exercise.exercise.name,
                        warmup: false,
                        additional: false,
                        completed: true,
                        performedLoad: series.performedLoad,
                        performedRepetitions: series.performedRepetitions,
                        perceivedEffort: series.perceivedEffort,
                      }),
                    ),
                  ),
                },
              },
            });
          }
        }
        await tx.routineReview.create({
          data: {
            routineId: routine.id,
            reviewedVersionId: version.id,
            reviewerTrainerId: actor.trainerId,
            result: 'APROBADA',
            observation: 'Rutina temporal preparada para demostración.',
            reviewedAt: new Date(periodEnd.getTime() - 60 * dayMs),
          },
        });
        const { diagnostic, proposal } = await calculateAdaptationDemo({
          studentId,
          scenario,
          previousDiagnosisAt:
            scenario === 'ESTANCAMIENTO_SEGUNDO'
              ? new Date(periodEnd.getTime() - 14 * dayMs)
              : null,
          now,
          diagnostics: new PrismaEvolutionDiagnosticsRepository(tx),
          proposals: new PrismaAdjustmentProposalsRepository(tx),
        });
        const result: AdaptationDemoResult = {
          runId: run.id,
          studentId,
          scenario,
          diagnosticId: diagnostic.diagnosticId,
          globalSituation: diagnostic.globalSituation,
          proposalId: proposal.proposalId,
          proposalState: proposal.proposalState,
          proposalStatus: proposal.status,
          preparedOn: dateOnly(periodEnd),
          reused: false,
        };
        await tx.adaptationDemoRun.update({
          where: { id: run.id },
          data: {
            result: {
              ...result,
              preparationVersion: ADAPTATION_DEMO_PLAN_VERSION,
            },
          },
        });
        await this.audit(tx, actor, run.id, 'PREPARACION_DEMO_ADAPTACION', {
          studentId,
          scenario,
          preparedRoutineId: routine.id,
          diagnosticId: diagnostic.diagnosticId,
          proposalId: proposal.proposalId,
        });
        return result;
      },
      { timeout: 60_000, maxWait: 15_000 },
    );
  }
}
