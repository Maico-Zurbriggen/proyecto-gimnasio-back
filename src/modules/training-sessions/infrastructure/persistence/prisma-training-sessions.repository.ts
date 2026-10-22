import type { Prisma, PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import {
  ExerciseNotFoundError,
  RoutineDayNotFoundError,
  RoutineNotActiveError,
  SeriesNotFoundError,
  SeriesOutOfRangeError,
  SessionAlreadyInProgressError,
  SessionNotFoundError,
  SessionNotInProgressError,
  StudentNotFoundError,
  AtypicalSeriesError,
  SessionAccessError,
} from '../../domain/errors';
import {
  isAtypicalLoad,
  isBeyondCorrectionWindow,
  isInactiveSince,
  roundLoadToCent,
  validateCompletedSeries,
  validateSeriesRanges,
} from '../../domain/session-policy';
import type {
  AbandonSessionCommand,
  FinishSessionCommand,
  ListSessionsQuery,
  StartSessionCommand,
  TrainingSessionPage,
  TrainingSessionView,
  TrainingSessionsRepository,
  UpdateSeriesCommand,
} from '../../application/ports/training-sessions.repository';
import type { AuthUser } from '../../../../shared/types/auth';
import { decodeSessionCursor, encodeSessionCursor } from '../session-cursor';

function toNumber(value: Prisma.Decimal | number | null): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function gymDateString(now: Date, timeZone: string): string {
  // RN-110, CB-46: el día que delimita la ocurrencia es el del gimnasio.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

type SessionRow = {
  id: string;
  studentId: string;
  routineId: string;
  routineVersionId: string;
  routineDayId: string;
  state: 'EN_CURSO' | 'COMPLETADA' | 'ABANDONADA' | 'BLOQUEADA';
  startedAt: Date;
  completedAt: Date | null;
  occurredOn: Date;
  lastActivityAt: Date;
  simulated: boolean;
  snapshotComplete: boolean;
  dayNameSnapshot: string | null;
  dayPositionSnapshot: number | null;
  versionNumberSnapshot: number | null;
  timezoneSnapshot: string | null;
  additionalSetRecords: {
    position: number;
    performedExerciseId: string;
    performedExerciseName: string;
    warmup: boolean;
    performedLoad: Prisma.Decimal | null;
    performedRepetitions: number | null;
    perceivedEffort: number | null;
    completed: boolean;
    omissionReason: string | null;
    atypicalConfirmed: boolean;
  }[];
  setRecords: {
    position: number;
    prescribedExerciseId: string;
    performedExerciseId: string | null;
    prescribedMinRepetitions: number;
    prescribedMaxRepetitions: number;
    prescribedLoad: Prisma.Decimal | null;
    prescribedExerciseName: string | null;
    prescribedExercisePosition: number | null;
    prescribedSetPosition: number | null;
    prescribedRestSeconds: number | null;
    prescribedNote: string | null;
    performedExerciseName: string | null;
    warmup: boolean;
    performedLoad: Prisma.Decimal | null;
    performedRepetitions: number | null;
    perceivedEffort: number | null;
    completed: boolean;
    additional: boolean;
    omissionReason: string | null;
    atypicalConfirmed: boolean;
  }[];
};

function toView(
  row: SessionRow,
  aptitudeWarning: 'AUSENTE' | 'VENCIDA' | null,
  compatibilityWarnings: { exerciseId: string; state: string }[],
): TrainingSessionView {
  return {
    id: row.id,
    studentId: row.studentId,
    routineId: row.routineId,
    routineVersionId: row.routineVersionId,
    routineDayId: row.routineDayId,
    routineDayName: row.dayNameSnapshot,
    routineDayPosition: row.dayPositionSnapshot,
    routineVersionNumber: row.versionNumberSnapshot,
    timezone: row.timezoneSnapshot,
    simulated: row.simulated,
    snapshotComplete: row.snapshotComplete,
    durationSeconds: row.completedAt
      ? Math.max(
          0,
          Math.floor(
            (row.completedAt.getTime() - row.startedAt.getTime()) / 1000,
          ),
        )
      : null,
    state: row.state,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    occurredOn:
      row.occurredOn instanceof Date
        ? row.occurredOn.toISOString().slice(0, 10)
        : String(row.occurredOn).slice(0, 10),
    lastActivityAt: row.lastActivityAt,
    aptitudeWarning,
    compatibilityWarnings,
    setRecords: [
      ...row.setRecords.map((record) => ({
        position: record.position,
        prescribedExerciseId: record.additional
          ? null
          : record.prescribedExerciseId,
        prescribedExerciseName: record.additional
          ? null
          : record.prescribedExerciseName,
        performedExerciseId: record.performedExerciseId,
        performedExerciseName: record.performedExerciseName,
        prescribedMinRepetitions: record.additional
          ? null
          : record.prescribedMinRepetitions,
        prescribedMaxRepetitions: record.additional
          ? null
          : record.prescribedMaxRepetitions,
        prescribedLoad: record.additional
          ? null
          : toNumber(record.prescribedLoad),
        prescribedExercisePosition: record.additional
          ? null
          : record.prescribedExercisePosition,
        prescribedSetPosition: record.additional
          ? null
          : record.prescribedSetPosition,
        prescribedRestSeconds: record.additional
          ? null
          : record.prescribedRestSeconds,
        prescribedNote: record.additional ? null : record.prescribedNote,
        prescribedWarmup: record.additional ? null : record.warmup,
        warmup: record.warmup,
        performedLoad: toNumber(record.performedLoad),
        performedRepetitions: record.performedRepetitions,
        perceivedEffort: record.perceivedEffort,
        completed: record.completed,
        additional: record.additional,
        omissionReason: record.omissionReason,
        atypicalConfirmed: record.atypicalConfirmed,
      })),
      ...row.additionalSetRecords.map((record) => ({
        position: record.position,
        performedExerciseId: record.performedExerciseId,
        performedExerciseName: record.performedExerciseName,
        warmup: record.warmup,
        performedRepetitions: record.performedRepetitions,
        perceivedEffort: record.perceivedEffort,
        completed: record.completed,
        omissionReason: record.omissionReason,
        atypicalConfirmed: record.atypicalConfirmed,
        performedLoad: toNumber(record.performedLoad),
        additional: true,
        prescribedExerciseId: null,
        prescribedExerciseName: null,
        prescribedMinRepetitions: null,
        prescribedMaxRepetitions: null,
        prescribedLoad: null,
        prescribedExercisePosition: null,
        prescribedSetPosition: null,
        prescribedRestSeconds: null,
        prescribedNote: null,
        prescribedWarmup: null,
      })),
    ].sort((a, b) => a.position - b.position),
  };
}

const sessionInclude = {
  additionalSetRecords: { orderBy: { position: 'asc' as const } },
  setRecords: {
    orderBy: { position: 'asc' as const },
  },
};

export class PrismaTrainingSessionsRepository implements TrainingSessionsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private async requireStudentGym(
    tx: Prisma.TransactionClient,
    studentId: string,
    gymId: string,
  ) {
    const student = await tx.studentProfile.findFirst({
      where: { userId: studentId, user: { gymId } },
      include: { user: { include: { gym: true } } },
    });
    if (!student) throw new SessionAccessError();
    return student;
  }

  private async checkTrainerAssignment(
    tx: Prisma.TransactionClient,
    trainerId: string,
    studentId: string,
    now: Date,
  ): Promise<boolean> {
    const assignment = await tx.trainerStudentAssignment.findFirst({
      where: {
        trainerId,
        studentId,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      select: { id: true },
    });
    return assignment !== null;
  }

  private async requireReadAccess(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    studentId: string,
    now: Date,
  ) {
    await this.requireStudentGym(tx, studentId, actor.gymId);
    if (actor.id === studentId && actor.roles.includes('ALUMNO')) return;
    if (
      actor.roles.includes('ENTRENADOR') &&
      (await this.checkTrainerAssignment(tx, actor.id, studentId, now))
    )
      return;
    throw new SessionAccessError();
  }

  private async expireStudentStaleSessions(
    tx: Prisma.TransactionClient,
    studentId: string,
    now: Date,
  ): Promise<void> {
    const threshold = new Date(now.getTime() - 8 * 3_600_000);
    await tx.trainingSession.updateMany({
      where: {
        studentId,
        state: 'EN_CURSO',
        lastActivityAt: { lte: threshold },
      },
      data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
    });
  }

  private async aptitudeWarningFor(
    tx: Prisma.TransactionClient,
    studentId: string,
    occurredOn: string,
  ): Promise<'AUSENTE' | 'VENCIDA' | null> {
    const latest = await tx.fitnessClearance.findFirst({
      where: { studentId },
      orderBy: { expiresOn: 'desc' },
    });
    if (!latest) return 'AUSENTE';
    const expires = latest.expiresOn.toISOString().slice(0, 10);
    return expires < occurredOn ? 'VENCIDA' : null;
  }

  async start(
    command: StartSessionCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.startSnapshot(command);
      } catch (error) {
        if (
          attempt >= 2 ||
          !(
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === 'P2034'
          )
        )
          throw error;
      }
    }
  }

  private async startSnapshot(
    command: StartSessionCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    const { actor, studentId, routineDayId, now } = command;
    if (!isUuid(studentId)) throw new StudentNotFoundError();

    return this.prisma.$transaction(
      async (tx) => {
        const student = await this.requireStudentGym(
          tx,
          studentId,
          actor.gymId,
        );

        // Cierre perezoso: una sesión abandonada no bloquea el inicio (RN-53).
        await this.expireStudentStaleSessions(tx, studentId, now);

        const inProgress = await tx.trainingSession.findFirst({
          where: { studentId, state: 'EN_CURSO' },
          select: { id: true },
        });
        if (inProgress) throw new SessionAlreadyInProgressError();

        const routine = await tx.routine.findFirst({
          where: { studentId, state: 'VIGENTE' },
          include: {
            versions: {
              where: { current: true },
              include: {
                days: {
                  orderBy: { position: 'asc' },
                  include: {
                    exercises: {
                      orderBy: { position: 'asc' },
                      include: {
                        exercise: { select: { name: true } },
                        sets: { orderBy: { position: 'asc' } },
                      },
                    },
                  },
                },
              },
            },
          },
        });
        if (!routine || routine.versions[0] === undefined) {
          throw new RoutineNotActiveError();
        }
        const version = routine.versions[0];
        if (version.days.length === 0) throw new RoutineNotActiveError();

        let day = routineDayId
          ? version.days.find((candidate) => candidate.id === routineDayId)
          : undefined;
        if (routineDayId && !day) throw new RoutineDayNotFoundError();
        if (!day) {
          // FL-05 paso 1: siguiente día del ciclo según el historial, cíclico.
          const last = await tx.trainingSession.findFirst({
            where: { studentId, routineId: routine.id },
            orderBy: { startedAt: 'desc' },
            include: { routineDay: { select: { position: true } } },
          });
          const lastPosition = last?.routineDay.position ?? 0;
          const nextPosition = (lastPosition % version.days.length) + 1;
          day =
            version.days.find(
              (candidate) => candidate.position === nextPosition,
            ) ?? version.days[0]!;
        }

        const occurredOn = gymDateString(now, student.user.gym.timezone);
        const aptitudeWarning = await this.aptitudeWarningFor(
          tx,
          studentId,
          occurredOn,
        );
        const compatibilityWarnings = day.exercises
          .filter((exercise) => exercise.compatibilityState !== 'COMPATIBLE')
          .map((exercise) => ({
            exerciseId: exercise.exerciseId,
            state: exercise.compatibilityState,
          }));

        let position = 0;
        const records = day.exercises.flatMap((exercise) =>
          exercise.sets.map((set) => {
            position += 1;
            return {
              position,
              prescribedExerciseId: exercise.exerciseId,
              prescribedExerciseName: exercise.exercise.name,
              prescribedExercisePosition: exercise.position,
              prescribedSetPosition: set.position,
              prescribedRestSeconds: set.restSeconds,
              prescribedNote: exercise.note,
              prescribedMinRepetitions: set.minRepetitions,
              prescribedMaxRepetitions: set.maxRepetitions,
              prescribedLoad: set.suggestedLoad,
              warmup: set.warmup,
            };
          }),
        );
        if (records.length === 0) throw new RoutineDayNotFoundError();

        try {
          const created = await tx.trainingSession.create({
            data: {
              studentId,
              routineId: routine.id,
              routineVersionId: version.id,
              routineDayId: day.id,
              snapshotComplete: true,
              dayNameSnapshot: day.name,
              dayPositionSnapshot: day.position,
              versionNumberSnapshot: version.versionNumber,
              timezoneSnapshot: student.user.gym.timezone,
              state: 'EN_CURSO',
              startedAt: now,
              occurredOn: new Date(`${occurredOn}T00:00:00Z`),
              lastActivityAt: now,
              setRecords: { create: records },
            },
            include: sessionInclude,
          });
          return toView(
            created as unknown as SessionRow,
            aptitudeWarning,
            compatibilityWarnings,
          );
        } catch (error) {
          if (
            typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (error as { code: string }).code === 'P2002'
          ) {
            throw new SessionAlreadyInProgressError();
          }
          throw error;
        }
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async findActive(
    studentId: string,
    now: Date,
    actor: AuthUser,
  ): Promise<TrainingSessionView | null> {
    if (!isUuid(studentId)) return null;
    return this.prisma.$transaction(async (tx) => {
      await this.requireReadAccess(tx, actor, studentId, now);
      await this.expireStudentStaleSessions(tx, studentId, now);
      const active = await tx.trainingSession.findFirst({
        where: { studentId, state: 'EN_CURSO' },
        include: sessionInclude,
      });
      if (!active) return null;
      const occurredOn = active.occurredOn.toISOString().slice(0, 10);
      const aptitudeWarning = await this.aptitudeWarningFor(
        tx,
        studentId,
        occurredOn,
      );
      const compatibilityWarnings: { exerciseId: string; state: string }[] = [];
      return toView(
        active as unknown as SessionRow,
        aptitudeWarning,
        compatibilityWarnings,
      );
    });
  }

  async updateSeries(
    command: UpdateSeriesCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    const { studentId, sessionId, position, now } = command;
    if (!isUuid(studentId) || !isUuid(sessionId)) {
      throw new SessionNotFoundError();
    }
    return this.prisma
      .$transaction(async (tx) => {
        await this.requireReadAccess(tx, command.actor, studentId, now);
        await tx.$queryRaw`SELECT id FROM app.training_sessions WHERE id = ${sessionId}::uuid AND student_id = ${studentId}::uuid FOR UPDATE`;
        const session = await tx.trainingSession.findFirst({
          where: { id: sessionId, studentId },
          include: sessionInclude,
        });
        if (!session) throw new SessionNotFoundError();
        const correcting =
          session.state === 'COMPLETADA' &&
          session.completedAt !== null &&
          now >= session.completedAt &&
          !isBeyondCorrectionWindow(session.completedAt, now);
        if (session.state !== 'EN_CURSO' && !correcting) {
          // ABANDONADA es terminal (D6/§4): corregir no es reabrir.
          throw new SessionNotInProgressError();
        }
        if (!correcting && isInactiveSince(session.lastActivityAt, now)) {
          await tx.trainingSession.update({
            where: { id: sessionId },
            data: {
              state: 'ABANDONADA',
              completedAt: now,
              lastActivityAt: now,
            },
          });
          // Commit the automatic abandonment before reporting the rejected edit.
          return new SessionNotInProgressError();
        }
        const prescribedRecord = await tx.sessionSetRecord.findFirst({
          where: { sessionId, position },
        });
        const extraRecord = prescribedRecord
          ? null
          : await tx.sessionAdditionalSetRecord.findFirst({
              where: { sessionId, position },
            });
        const additional = prescribedRecord?.additional ?? true;
        if (
          command.additional !== undefined &&
          command.additional !== additional
        ) {
          throw new SeriesOutOfRangeError([
            {
              field: 'additional',
              message: 'El origen de la serie es inmutable',
            },
          ]);
        }
        if (
          command.performedWarmup !== undefined &&
          (prescribedRecord !== null ||
            (extraRecord && command.performedWarmup !== extraRecord.warmup))
        ) {
          throw new SeriesOutOfRangeError([
            {
              field: 'performedWarmup',
              message: 'El calentamiento se define al crear la serie adicional',
            },
          ]);
        }
        const creatingExtra = !prescribedRecord && !extraRecord;
        if (creatingExtra) {
          const lastPosition = Math.max(
            0,
            ...session.setRecords.map((r) => r.position),
            ...session.additionalSetRecords.map((r) => r.position),
          );
          if (!command.additional || position !== lastPosition + 1)
            throw new SeriesNotFoundError();
          if (!command.performedExerciseId) throw new ExerciseNotFoundError();
        }
        const record = prescribedRecord ??
          extraRecord ?? {
            performedExerciseId: null,
            performedExerciseName: null,
            performedLoad: null,
            performedRepetitions: null,
            completed: false,
            omissionReason: null,
            atypicalConfirmed: false,
          };

        const violations = validateSeriesRanges({
          performedLoad: command.performedLoad,
          performedRepetitions: command.performedRepetitions,
          perceivedEffort: command.perceivedEffort,
        });
        if (violations.length > 0) {
          throw new SeriesOutOfRangeError(
            violations.map((message) => ({ field: 'series', message })),
          );
        }

        let performedExerciseId = record.performedExerciseId;
        let performedExerciseName = record.performedExerciseName;
        if (command.performedExerciseId !== undefined) {
          if (command.performedExerciseId === null) {
            performedExerciseId = null;
            performedExerciseName = null;
          } else {
            if (!isUuid(command.performedExerciseId)) {
              throw new ExerciseNotFoundError();
            }
            const exercise = await tx.exercise.findFirst({
              where: {
                id: command.performedExerciseId,
                OR: [{ gymId: null }, { gymId: command.actor.gymId }],
              },
              select: { id: true, name: true },
            });
            if (!exercise) throw new ExerciseNotFoundError();
            performedExerciseId = exercise.id;
            performedExerciseName = exercise.name;
          }
        }

        // Sin sustitución, el ejecutado es el prescripto (D4/PD-02). El CHECK
        // `session_set_records_completed_data_check` lo exige no nulo al
        // completar; si no se fija acá, el guardar revienta con 500.
        const mergedCompleted = command.completed ?? record.completed;
        if (mergedCompleted && performedExerciseId === null) {
          performedExerciseId = prescribedRecord?.prescribedExerciseId ?? null;
          performedExerciseName =
            prescribedRecord?.prescribedExerciseName ?? null;
        }

        // Completa el dominio antes de tocar la base: carga y repeticiones
        // ejecutadas son obligatorias para una serie completada.
        const mergedLoad =
          command.performedLoad !== undefined
            ? command.performedLoad
            : record.performedLoad === null
              ? null
              : Number(record.performedLoad);
        const mergedRepetitions =
          command.performedRepetitions !== undefined
            ? command.performedRepetitions
            : record.performedRepetitions;
        const completedViolations = validateCompletedSeries({
          completed: mergedCompleted,
          performedExerciseId,
          performedLoad: mergedLoad,
          performedRepetitions: mergedRepetitions,
        });
        if (completedViolations.length > 0) {
          throw new SeriesOutOfRangeError(
            completedViolations.map((message) => ({
              field: 'series',
              message,
            })),
          );
        }
        const omissionReason =
          command.omissionReason === undefined
            ? record.omissionReason
            : command.omissionReason;
        if (mergedCompleted && omissionReason)
          throw new SeriesOutOfRangeError([
            {
              field: 'omissionReason',
              message: 'Una serie omitida no puede estar completada',
            },
          ]);
        if (additional && !performedExerciseId)
          throw new ExerciseNotFoundError();

        // RN-55a: el mejor histórico decide la atipicidad, no el intento aislado.
        if (
          command.performedLoad !== undefined &&
          command.performedLoad !== null &&
          !command.atypicalConfirmed
        ) {
          const exerciseId =
            performedExerciseId ?? prescribedRecord?.prescribedExerciseId;
          const historyWhere = {
            session: { studentId, simulated: false },
            performedExerciseId: exerciseId,
            completed: true,
            warmup: false,
            performedLoad: { not: null },
          };
          const [history, extraHistory] = await Promise.all([
            tx.sessionSetRecord.aggregate({
              where: {
                ...historyWhere,
              },
              _max: { performedLoad: true },
            }),
            tx.sessionAdditionalSetRecord.aggregate({
              where: historyWhere,
              _max: { performedLoad: true },
            }),
          ]);
          const loads = [
            history._max.performedLoad,
            extraHistory._max.performedLoad,
          ]
            .filter((v) => v !== null)
            .map(Number);
          const best = loads.length ? Math.max(...loads) : null;
          if (isAtypicalLoad(command.performedLoad, best)) {
            throw new AtypicalSeriesError(best, command.performedLoad);
          }
        }

        const roundedLoad =
          command.performedLoad === undefined
            ? undefined
            : command.performedLoad === null
              ? null
              : roundLoadToCent(command.performedLoad);

        const execution = {
          performedLoad: roundedLoad,
          performedRepetitions: command.performedRepetitions,
          perceivedEffort: command.perceivedEffort,
          completed: command.completed,
          omissionReason: command.omissionReason,
          performedExerciseId,
          performedExerciseName,
          atypicalConfirmed:
            command.atypicalConfirmed ?? record.atypicalConfirmed,
        };
        if (prescribedRecord) {
          await tx.sessionSetRecord.update({
            where: { id: prescribedRecord.id },
            data: execution,
          });
        } else {
          const extraExecution = {
            ...execution,
            performedExerciseId: performedExerciseId!,
            performedExerciseName: performedExerciseName!,
          };
          if (extraRecord)
            await tx.sessionAdditionalSetRecord.update({
              where: { id: extraRecord.id },
              data: extraExecution,
            });
          else
            await tx.sessionAdditionalSetRecord.create({
              data: {
                ...extraExecution,
                sessionId,
                position,
                warmup: command.performedWarmup ?? false,
              },
            });
        }
        await tx.trainingSession.update({
          where: { id: sessionId },
          data: { lastActivityAt: now },
        });

        const updated = await tx.trainingSession.findFirstOrThrow({
          where: { id: sessionId },
          include: sessionInclude,
        });
        const occurredOn = updated.occurredOn.toISOString().slice(0, 10);
        const aptitudeWarning = await this.aptitudeWarningFor(
          tx,
          studentId,
          occurredOn,
        );
        return toView(updated as unknown as SessionRow, aptitudeWarning, []);
      })
      .then((result) => {
        if (result instanceof SessionNotInProgressError) throw result;
        return result;
      });
  }

  async finish(
    command: FinishSessionCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    const { studentId, sessionId, now } = command;
    if (!isUuid(studentId) || !isUuid(sessionId)) {
      throw new SessionNotFoundError();
    }
    return this.prisma
      .$transaction(async (tx) => {
        await this.requireReadAccess(tx, command.actor, studentId, now);
        await tx.$queryRaw`SELECT id FROM app.training_sessions WHERE id = ${sessionId}::uuid AND student_id = ${studentId}::uuid FOR UPDATE`;
        const session = await tx.trainingSession.findFirst({
          where: { id: sessionId, studentId },
          select: { id: true, state: true, lastActivityAt: true },
        });
        if (!session) throw new SessionNotFoundError();
        if (session.state !== 'EN_CURSO') throw new SessionNotInProgressError();
        if (isInactiveSince(session.lastActivityAt, now)) {
          await tx.trainingSession.update({
            where: { id: sessionId },
            data: {
              state: 'ABANDONADA',
              completedAt: now,
              lastActivityAt: now,
            },
          });
          return new SessionNotInProgressError();
        }
        const updated = await tx.trainingSession.update({
          where: { id: sessionId },
          data: { state: 'COMPLETADA', completedAt: now, lastActivityAt: now },
          include: sessionInclude,
        });
        const occurredOn = updated.occurredOn.toISOString().slice(0, 10);
        const aptitudeWarning = await this.aptitudeWarningFor(
          tx,
          studentId,
          occurredOn,
        );
        return toView(updated as unknown as SessionRow, aptitudeWarning, []);
      })
      .then((result) => {
        if (result instanceof SessionNotInProgressError) throw result;
        return result;
      });
  }

  async abandon(
    command: AbandonSessionCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    const { studentId, sessionId, now } = command;
    if (!isUuid(studentId) || !isUuid(sessionId)) {
      throw new SessionNotFoundError();
    }
    return this.prisma.$transaction(async (tx) => {
      await this.requireReadAccess(tx, command.actor, studentId, now);
      await tx.$queryRaw`SELECT id FROM app.training_sessions WHERE id = ${sessionId}::uuid AND student_id = ${studentId}::uuid FOR UPDATE`;
      const session = await tx.trainingSession.findFirst({
        where: { id: sessionId, studentId },
        select: { id: true, state: true },
      });
      if (!session) throw new SessionNotFoundError();
      if (session.state !== 'EN_CURSO') throw new SessionNotInProgressError();
      const updated = await tx.trainingSession.update({
        where: { id: sessionId },
        data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
        include: sessionInclude,
      });
      const occurredOn = updated.occurredOn.toISOString().slice(0, 10);
      const aptitudeWarning = await this.aptitudeWarningFor(
        tx,
        studentId,
        occurredOn,
      );
      return toView(updated as unknown as SessionRow, aptitudeWarning, []);
    });
  }

  async expireInactive(
    now: Date,
  ): Promise<{ abandoned: number; blocked: number }> {
    const inactivityThreshold = new Date(now.getTime() - 8 * 3_600_000);
    const correctionThreshold = new Date(now.getTime() - 48 * 3_600_000);
    const abandoned = await this.prisma.trainingSession.updateMany({
      where: {
        state: 'EN_CURSO',
        lastActivityAt: { lte: inactivityThreshold },
      },
      data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
    });
    const blocked = await this.prisma.trainingSession.updateMany({
      where: { state: 'COMPLETADA', completedAt: { lte: correctionThreshold } },
      data: { state: 'BLOQUEADA' },
    });
    void isBeyondCorrectionWindow;
    return { abandoned: abandoned.count, blocked: blocked.count };
  }

  async list(
    command: {
      actor: AuthUser;
      studentId: string;
      now: Date;
    } & ListSessionsQuery,
  ): Promise<TrainingSessionPage> {
    const { actor, studentId, state, from, to, now } = command;
    const page = Math.max(1, Math.floor(command.page) || 1);
    const pageSize = Math.min(
      50,
      Math.max(1, Math.floor(command.pageSize) || 20),
    );
    if (!isUuid(studentId)) throw new SessionNotFoundError();
    return this.prisma.$transaction(async (tx) => {
      await this.requireReadAccess(tx, actor, studentId, now);
      // La lectura también abandona lo vencido: el historial nunca muestra
      // una EN_CURSO que ya superó las 8 h sin actividad (RN-53).
      await this.expireStudentStaleSessions(tx, studentId, now);
      const where: Prisma.TrainingSessionWhereInput = {
        studentId,
        ...(command.simulated === undefined
          ? {}
          : { simulated: command.simulated }),
        ...(state ? { state } : {}),
        ...(from || to
          ? {
              occurredOn: {
                ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}),
                ...(to ? { lte: new Date(`${to}T00:00:00Z`) } : {}),
              },
            }
          : {}),
      };
      const cursor = command.cursor
        ? decodeSessionCursor(command.cursor)
        : null;
      if (command.cursor && !cursor) throw new SessionNotFoundError();
      const windowWhere: Prisma.TrainingSessionWhereInput = cursor
        ? {
            AND: [
              where,
              {
                OR: [
                  {
                    occurredOn: {
                      lt: new Date(`${cursor.occurredOn}T00:00:00Z`),
                    },
                  },
                  {
                    occurredOn: new Date(`${cursor.occurredOn}T00:00:00Z`),
                    startedAt: { lt: cursor.startedAt },
                  },
                  {
                    occurredOn: new Date(`${cursor.occurredOn}T00:00:00Z`),
                    startedAt: cursor.startedAt,
                    id: { lt: cursor.id },
                  },
                ],
              },
            ],
          }
        : where;
      const [total, rows] = await Promise.all([
        tx.trainingSession.count({ where }),
        tx.trainingSession.findMany({
          where: windowWhere,
          orderBy: [
            { occurredOn: 'desc' },
            { startedAt: 'desc' },
            { id: 'desc' },
          ],
          skip: cursor ? 0 : (page - 1) * pageSize,
          take: pageSize + 1,
          include: {
            _count: {
              select: {
                setRecords: true,
                additionalSetRecords: true,
              },
            },
          },
        }),
      ]);
      const visible = rows.slice(0, pageSize);
      // Counts are grouped in two bounded queries, never one query per session.
      const ids = visible.map((row) => row.id);
      const [completed, extraCompleted] = await Promise.all([
        tx.sessionSetRecord.groupBy({
          by: ['sessionId'],
          where: { sessionId: { in: ids }, completed: true },
          _count: true,
        }),
        tx.sessionAdditionalSetRecord.groupBy({
          by: ['sessionId'],
          where: { sessionId: { in: ids }, completed: true },
          _count: true,
        }),
      ]);
      const counts = new Map<string, number>();
      for (const row of [...completed, ...extraCompleted])
        counts.set(
          row.sessionId,
          (counts.get(row.sessionId) ?? 0) + row._count,
        );
      let nextCursor: string | null = null;
      if (rows.length > pageSize && visible.length) {
        const last = visible[visible.length - 1]!;
        // Prisma Date loses PostgreSQL microseconds. Keep full precision in the
        // keyset token so historical timestamps cannot skip equal-date rows.
        const precise = await tx.$queryRaw<
          Array<{ instant: string }>
        >`SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS instant FROM app.training_sessions WHERE id = ${last.id}::uuid`;
        nextCursor = encodeSessionCursor({
          ...last,
          startedAt: precise[0]!.instant,
        });
      }
      await this.requireReadAccess(tx, actor, studentId, now);
      return {
        items: visible.map((row) => ({
          id: row.id,
          studentId: row.studentId,
          routineDayName: row.dayNameSnapshot,
          routineDayPosition: row.dayPositionSnapshot,
          routineId: row.routineId,
          routineVersionId: row.routineVersionId,
          routineDayId: row.routineDayId,
          routineVersionNumber: row.versionNumberSnapshot,
          timezone: row.timezoneSnapshot,
          simulated: row.simulated,
          snapshotComplete: row.snapshotComplete,
          durationSeconds: row.completedAt
            ? Math.max(
                0,
                Math.floor(
                  (row.completedAt.getTime() - row.startedAt.getTime()) / 1000,
                ),
              )
            : null,
          state: row.state,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          occurredOn: row.occurredOn.toISOString().slice(0, 10),
          totalSeries: row._count.setRecords + row._count.additionalSetRecords,
          completedSeries: counts.get(row.id) ?? 0,
        })),
        total,
        page,
        pageSize,
        nextCursor,
      };
    });
  }

  async getById(command: {
    actor: AuthUser;
    studentId: string;
    sessionId: string;
    now: Date;
  }): Promise<TrainingSessionView> {
    const { actor, studentId, sessionId, now } = command;
    if (!isUuid(studentId) || !isUuid(sessionId)) {
      throw new SessionNotFoundError();
    }
    return this.prisma.$transaction(async (tx) => {
      await this.requireReadAccess(tx, actor, studentId, now);
      await this.expireStudentStaleSessions(tx, studentId, now);
      const session = await tx.trainingSession.findFirst({
        where: { id: sessionId, studentId },
        include: sessionInclude,
      });
      if (!session) throw new SessionNotFoundError();
      const occurredOn = session.occurredOn.toISOString().slice(0, 10);
      const aptitudeWarning = await this.aptitudeWarningFor(
        tx,
        studentId,
        occurredOn,
      );
      await this.requireReadAccess(tx, actor, studentId, now);
      return toView(session as unknown as SessionRow, aptitudeWarning, []);
    });
  }
}
