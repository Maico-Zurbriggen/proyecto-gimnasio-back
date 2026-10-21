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
  routineDay: { id: string; name: string; position: number };
  setRecords: {
    position: number;
    prescribedExerciseId: string;
    performedExerciseId: string | null;
    prescribedMinRepetitions: number;
    prescribedMaxRepetitions: number;
    prescribedLoad: Prisma.Decimal | null;
    warmup: boolean;
    performedLoad: Prisma.Decimal | null;
    performedRepetitions: number | null;
    perceivedEffort: number | null;
    completed: boolean;
    additional: boolean;
    omissionReason: string | null;
    atypicalConfirmed: boolean;
    prescribedExercise: { name: string };
    performedExercise: { name: string } | null;
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
    routineDayName: row.routineDay.name,
    routineDayPosition: row.routineDay.position,
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
    setRecords: row.setRecords.map((record) => ({
      position: record.position,
      prescribedExerciseId: record.prescribedExerciseId,
      prescribedExerciseName: record.prescribedExercise.name,
      performedExerciseId: record.performedExerciseId,
      performedExerciseName: record.performedExercise?.name ?? null,
      prescribedMinRepetitions: record.prescribedMinRepetitions,
      prescribedMaxRepetitions: record.prescribedMaxRepetitions,
      prescribedLoad: toNumber(record.prescribedLoad),
      warmup: record.warmup,
      performedLoad: toNumber(record.performedLoad),
      performedRepetitions: record.performedRepetitions,
      perceivedEffort: record.perceivedEffort,
      completed: record.completed,
      additional: record.additional,
      omissionReason: record.omissionReason,
      atypicalConfirmed: record.atypicalConfirmed,
    })),
  };
}

const sessionInclude = {
  routineDay: { select: { id: true, name: true, position: true } },
  setRecords: {
    orderBy: { position: 'asc' as const },
    include: {
      prescribedExercise: { select: { name: true } },
      performedExercise: { select: { name: true } },
    },
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
    if (!student) throw new StudentNotFoundError();
    return student;
  }

  private async checkTrainerAssignment(
    tx: Prisma.TransactionClient,
    trainerId: string,
    studentId: string,
  ): Promise<boolean> {
    const now = new Date();
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
        lastActivityAt: { lt: threshold },
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
    const { actor, studentId, routineDayId, now } = command;
    if (!isUuid(studentId)) throw new StudentNotFoundError();

    return this.prisma.$transaction(async (tx) => {
      const student = await this.requireStudentGym(tx, studentId, actor.gymId);

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
    });
  }

  async findActive(
    studentId: string,
    now: Date,
  ): Promise<TrainingSessionView | null> {
    if (!isUuid(studentId)) return null;
    return this.prisma.$transaction(async (tx) => {
      await this.expireStudentStaleSessions(tx, studentId, now);
      const active = await tx.trainingSession.findFirst({
        where: { studentId, state: 'EN_CURSO' },
        include: sessionInclude,
      });
      if (!active) return null;
      const student = await tx.studentProfile.findFirst({
        where: { userId: studentId },
        include: { user: { include: { gym: true } } },
      });
      const occurredOn = active.occurredOn.toISOString().slice(0, 10);
      const aptitudeWarning = await this.aptitudeWarningFor(
        tx,
        studentId,
        occurredOn,
      );
      void student;
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
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.trainingSession.findFirst({
        where: { id: sessionId, studentId },
        include: sessionInclude,
      });
      if (!session) throw new SessionNotFoundError();
      if (session.state !== 'EN_CURSO') {
        // ABANDONADA es terminal (D6/§4): corregir no es reabrir.
        throw new SessionNotInProgressError();
      }
      if (isInactiveSince(session.lastActivityAt, now)) {
        await tx.trainingSession.update({
          where: { id: sessionId },
          data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
        });
        throw new SessionNotInProgressError();
      }
      const record = await tx.sessionSetRecord.findFirst({
        where: { sessionId, position },
      });
      if (!record) throw new SeriesNotFoundError();

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
      if (command.performedExerciseId !== undefined) {
        if (command.performedExerciseId === null) {
          performedExerciseId = null;
        } else {
          if (!isUuid(command.performedExerciseId)) {
            throw new ExerciseNotFoundError();
          }
          const exercise = await tx.exercise.findFirst({
            where: { id: command.performedExerciseId },
            select: { id: true },
          });
          if (!exercise) throw new ExerciseNotFoundError();
          performedExerciseId = exercise.id;
        }
      }

      // Sin sustitución, el ejecutado es el prescripto (D4/PD-02). El CHECK
      // `session_set_records_completed_data_check` lo exige no nulo al
      // completar; si no se fija acá, el guardar revienta con 500.
      const mergedCompleted = command.completed ?? record.completed;
      if (mergedCompleted && performedExerciseId === null) {
        performedExerciseId = record.prescribedExerciseId;
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
          completedViolations.map((message) => ({ field: 'series', message })),
        );
      }

      // RN-55a: el mejor histórico decide la atipicidad, no el intento aislado.
      if (
        command.performedLoad !== undefined &&
        command.performedLoad !== null &&
        !command.atypicalConfirmed
      ) {
        const exerciseId = performedExerciseId ?? record.prescribedExerciseId;
        const history = await tx.sessionSetRecord.findMany({
          where: {
            session: { studentId },
            OR: [
              { prescribedExerciseId: exerciseId },
              { performedExerciseId: exerciseId },
            ],
            completed: true,
            warmup: false,
            performedLoad: { not: null },
          },
          select: { performedLoad: true },
          take: 500,
        });
        const best = history.reduce<number | null>((max, row) => {
          const value =
            row.performedLoad === null ? null : Number(row.performedLoad);
          if (value === null) return max;
          return max === null ? value : Math.max(max, value);
        }, null);
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

      await tx.sessionSetRecord.update({
        where: { id: record.id },
        data: {
          performedLoad: roundedLoad,
          performedRepetitions: command.performedRepetitions,
          perceivedEffort: command.perceivedEffort,
          completed: command.completed,
          additional: command.additional,
          omissionReason: command.omissionReason,
          performedExerciseId,
          atypicalConfirmed:
            command.atypicalConfirmed ?? record.atypicalConfirmed,
        },
      });
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
    });
  }

  async finish(
    command: FinishSessionCommand & { now: Date },
  ): Promise<TrainingSessionView> {
    const { studentId, sessionId, now } = command;
    if (!isUuid(studentId) || !isUuid(sessionId)) {
      throw new SessionNotFoundError();
    }
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.trainingSession.findFirst({
        where: { id: sessionId, studentId },
        select: { id: true, state: true, lastActivityAt: true },
      });
      if (!session) throw new SessionNotFoundError();
      if (session.state !== 'EN_CURSO') throw new SessionNotInProgressError();
      if (isInactiveSince(session.lastActivityAt, now)) {
        await tx.trainingSession.update({
          where: { id: sessionId },
          data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
        });
        throw new SessionNotInProgressError();
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
      where: { state: 'EN_CURSO', lastActivityAt: { lt: inactivityThreshold } },
      data: { state: 'ABANDONADA', completedAt: now, lastActivityAt: now },
    });
    const blocked = await this.prisma.trainingSession.updateMany({
      where: { state: 'COMPLETADA', completedAt: { lt: correctionThreshold } },
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
      await this.requireStudentGym(tx, studentId, actor.gymId);
      // La lectura también abandona lo vencido: el historial nunca muestra
      // una EN_CURSO que ya superó las 8 h sin actividad (RN-53).
      await this.expireStudentStaleSessions(tx, studentId, now);
      const where = {
        studentId,
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
      const [total, rows] = await Promise.all([
        tx.trainingSession.count({ where }),
        tx.trainingSession.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            routineDay: { select: { name: true, position: true } },
            setRecords: { select: { completed: true } },
          },
        }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          studentId: row.studentId,
          routineDayName: row.routineDay.name,
          routineDayPosition: row.routineDay.position,
          state: row.state,
          startedAt: row.startedAt,
          completedAt: row.completedAt,
          occurredOn: row.occurredOn.toISOString().slice(0, 10),
          totalSeries: row.setRecords.length,
          completedSeries: row.setRecords.filter((record) => record.completed)
            .length,
        })),
        total,
        page,
        pageSize,
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
      await this.requireStudentGym(tx, studentId, actor.gymId);
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
      return toView(session as unknown as SessionRow, aptitudeWarning, []);
    });
  }
}
