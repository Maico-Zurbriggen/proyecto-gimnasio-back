import type { AuthUser } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  AtypicalSeriesError,
  ExerciseNotFoundError,
  RoutineDayNotFoundError,
  RoutineNotActiveError,
  SeriesNotFoundError,
  SeriesOutOfRangeError,
  SessionAccessError,
  SessionAlreadyInProgressError,
  SessionNotFoundError,
  SessionNotInProgressError,
  StudentNotFoundError,
} from '../../domain/errors';
import type {
  AbandonSessionCommand,
  FinishSessionCommand,
  ListSessionsQuery,
  StartSessionCommand,
  TrainingSessionsRepository,
  UpdateSeriesCommand,
} from '../ports/training-sessions.repository';

function requireSelfOrThrow(actor: AuthUser, studentId: string): void {
  // RA-01: el alumno sólo opera su propia sesión. Entrenador/administrador
  // no inician ni registran series por él; su acceso es de lectura.
  if (!actor.roles.includes('ALUMNO') || actor.id !== studentId) {
    throw new SessionAccessError();
  }
}

export class StartTrainingSessionUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: StartSessionCommand) {
    requireSelfOrThrow(input.actor, input.studentId);
    try {
      return await this.sessions.start({ ...input, now: this.clock.now() });
    } catch (error) {
      if (
        error instanceof SessionAlreadyInProgressError ||
        error instanceof RoutineNotActiveError ||
        error instanceof RoutineDayNotFoundError ||
        error instanceof StudentNotFoundError
      ) {
        throw error;
      }
      throw error;
    }
  }
}

export class GetActiveTrainingSessionUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(actor: AuthUser, studentId: string) {
    if (
      !(actor.id === studentId && actor.roles.includes('ALUMNO')) &&
      !actor.roles.includes('ENTRENADOR')
    ) {
      throw new SessionAccessError();
    }
    const active = await this.sessions.findActive(studentId, this.clock.now());
    if (!active) throw new SessionNotFoundError();
    return active;
  }
}

export class UpdateSeriesUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateSeriesCommand) {
    requireSelfOrThrow(input.actor, input.studentId);
    try {
      return await this.sessions.updateSeries({
        ...input,
        now: this.clock.now(),
      });
    } catch (error) {
      if (
        error instanceof SessionNotFoundError ||
        error instanceof SessionNotInProgressError ||
        error instanceof SeriesNotFoundError ||
        error instanceof SeriesOutOfRangeError ||
        error instanceof ExerciseNotFoundError ||
        error instanceof AtypicalSeriesError
      ) {
        throw error;
      }
      throw error;
    }
  }
}

export class FinishTrainingSessionUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: FinishSessionCommand) {
    requireSelfOrThrow(input.actor, input.studentId);
    return this.sessions.finish({ ...input, now: this.clock.now() });
  }
}

export class AbandonTrainingSessionUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: AbandonSessionCommand) {
    requireSelfOrThrow(input.actor, input.studentId);
    return this.sessions.abandon({ ...input, now: this.clock.now() });
  }
}

export class ExpireTrainingSessionsUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  execute() {
    return this.sessions.expireInactive(this.clock.now());
  }
}

function requireHistoryAccess(actor: AuthUser, studentId: string): void {
  // RA-01: el alumno sólo ve su propio historial; el entrenador lo ve
  // desde la cartera (la asignación vigente la verifica el middleware).
  if (
    !(actor.id === studentId && actor.roles.includes('ALUMNO')) &&
    !actor.roles.includes('ENTRENADOR')
  ) {
    throw new SessionAccessError();
  }
}

export class ListTrainingSessionsUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  execute(actor: AuthUser, studentId: string, query: ListSessionsQuery) {
    requireHistoryAccess(actor, studentId);
    return this.sessions.list({
      actor,
      studentId,
      ...query,
      now: this.clock.now(),
    });
  }
}

export class GetTrainingSessionUseCase {
  constructor(
    private readonly sessions: TrainingSessionsRepository,
    private readonly clock: Clock,
  ) {}

  execute(actor: AuthUser, studentId: string, sessionId: string) {
    requireHistoryAccess(actor, studentId);
    return this.sessions.getById({
      actor,
      studentId,
      sessionId,
      now: this.clock.now(),
    });
  }
}
