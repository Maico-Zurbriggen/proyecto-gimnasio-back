import type { AuthUser } from '../../../../shared/types/auth';

export type TrainingSessionState =
  'EN_CURSO' | 'COMPLETADA' | 'ABANDONADA' | 'BLOQUEADA';

/** Resumen para el historial (RF-035): sin el detalle serie por serie. */
export interface TrainingSessionSummary {
  id: string;
  studentId: string;
  routineDayName: string;
  routineDayPosition: number;
  state: TrainingSessionState;
  startedAt: Date;
  completedAt: Date | null;
  occurredOn: string;
  totalSeries: number;
  completedSeries: number;
}

export interface ListSessionsQuery {
  state?: TrainingSessionState;
  /** Fecha local del gimnasio `YYYY-MM-DD`, inclusiva. */
  from?: string;
  /** Fecha local del gimnasio `YYYY-MM-DD`, inclusiva. */
  to?: string;
  page: number;
  pageSize: number;
}

export interface TrainingSessionPage {
  items: TrainingSessionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionSetRecordView {
  position: number;
  prescribedExerciseId: string;
  prescribedExerciseName: string;
  performedExerciseId: string | null;
  performedExerciseName: string | null;
  prescribedMinRepetitions: number;
  prescribedMaxRepetitions: number;
  prescribedLoad: number | null;
  warmup: boolean;
  performedLoad: number | null;
  performedRepetitions: number | null;
  perceivedEffort: number | null;
  completed: boolean;
  additional: boolean;
  omissionReason: string | null;
  atypicalConfirmed: boolean;
}

export interface TrainingSessionView {
  id: string;
  studentId: string;
  routineId: string;
  routineVersionId: string;
  routineDayId: string;
  routineDayName: string;
  routineDayPosition: number;
  state: TrainingSessionState;
  startedAt: Date;
  completedAt: Date | null;
  occurredOn: string;
  lastActivityAt: Date;
  aptitudeWarning: 'AUSENTE' | 'VENCIDA' | null;
  compatibilityWarnings: { exerciseId: string; state: string }[];
  setRecords: SessionSetRecordView[];
}

export interface StartSessionCommand {
  actor: AuthUser;
  studentId: string;
  routineDayId: string;
}

export interface UpdateSeriesCommand {
  actor: AuthUser;
  studentId: string;
  sessionId: string;
  position: number;
  performedLoad?: number | null;
  performedRepetitions?: number | null;
  perceivedEffort?: number | null;
  completed?: boolean;
  additional?: boolean;
  omissionReason?: string | null;
  performedExerciseId?: string | null;
  atypicalConfirmed?: boolean;
}

export interface FinishSessionCommand {
  actor: AuthUser;
  studentId: string;
  sessionId: string;
}

export interface AbandonSessionCommand {
  actor: AuthUser;
  studentId: string;
  sessionId: string;
}

export interface TrainingSessionsRepository {
  start(
    command: StartSessionCommand & { now: Date },
  ): Promise<TrainingSessionView>;
  findActive(studentId: string, now: Date): Promise<TrainingSessionView | null>;
  updateSeries(
    command: UpdateSeriesCommand & { now: Date },
  ): Promise<TrainingSessionView>;
  finish(
    command: FinishSessionCommand & { now: Date },
  ): Promise<TrainingSessionView>;
  abandon(
    command: AbandonSessionCommand & { now: Date },
  ): Promise<TrainingSessionView>;
  /** Cierre automático: ABANDONADA por 8 h y BLOQUEADA por 48 h. Idempotente. */
  expireInactive(now: Date): Promise<{ abandoned: number; blocked: number }>;
  /** Historial paginado del alumno, de la más reciente a la más vieja. */
  list(
    command: {
      actor: AuthUser;
      studentId: string;
      now: Date;
    } & ListSessionsQuery,
  ): Promise<TrainingSessionPage>;
  /** Detalle de una sesión del alumno, con prescripción congelada y valores. */
  getById(command: {
    actor: AuthUser;
    studentId: string;
    sessionId: string;
    now: Date;
  }): Promise<TrainingSessionView>;
}
