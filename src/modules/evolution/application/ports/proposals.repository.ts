import type {
  AdjustmentType,
  RoutineDayPlan,
} from '../../domain/services/apply-adjustments';
import type { ResolutionPlan } from '../../domain/services/proposal-resolution';

export type ProposedAdjustmentState = 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO';

export interface ProposalAdjustmentRecord {
  id: string;
  type: AdjustmentType;
  routineExerciseId: string | null;
  exerciseName: string | null;
  criterion: string;
  previousValue: unknown;
  proposedValue: unknown;
  supportingData: unknown;
  state: ProposedAdjustmentState;
}

export interface ProposalRecord {
  id: string;
  state: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionReason: string | null;
  student: { id: string; displayName: string };
  diagnostic: {
    periodStart: Date;
    periodEnd: Date;
    globalSituation: string;
    adherence: number | null;
  };
  routine: {
    id: string;
    routineType: string;
    cycleStart: Date;
    currentVersionNumber: number | null;
  } | null;
  adjustments: ProposalAdjustmentRecord[];
  /** Fechas de todas las mediciones corporales del alumno. */
  measurementDates: Date[];
  /** Creación de las propuestas anteriores del alumno, de la más reciente a la más antigua. */
  previousProposalDates: Date[];
}

export interface CurrentVersionSnapshot {
  routineId: string;
  days: RoutineDayPlan[];
}

export interface PersistResolutionCommand {
  proposalId: string;
  trainerId: string;
  studentId: string;
  plan: ResolutionPlan;
  /** Rutina y días de la versión nueva; `null` al rechazar. */
  routineId: string | null;
  newVersionDays: RoutineDayPlan[] | null;
  resolvedAt: Date;
}

export interface PersistResolutionResult {
  resolved: boolean;
  resultingVersionNumber: number | null;
}

export interface ProposalsRepository {
  findById(proposalId: string): Promise<ProposalRecord | null>;
  findPendingForTrainer(trainerId: string): Promise<ProposalRecord[]>;
  findCurrentVersion(routineId: string): Promise<CurrentVersionSnapshot | null>;
  /**
   * Resuelve la propuesta en una única transacción: la bloquea y verifica que siga
   * PENDIENTE, crea la versión nueva y su revisión, marca los ajustes, audita y avisa.
   * Devuelve `resolved: false` si otra resolución llegó antes.
   */
  persistResolution(
    command: PersistResolutionCommand,
  ): Promise<PersistResolutionResult>;
}
