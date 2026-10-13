import type { EvaluacionDatosRenovacion } from '../../../routines/domain/services/cycle-renewal-data';

export interface RenewalEvaluation extends EvaluacionDatosRenovacion {
  criterio: string;
  estructuraVigente?: {
    routineType: string;
    targetWeeklyFrequency: number;
    days: Array<{
      position: number;
      name: string;
      dominantPattern: string;
      exercises: Array<{
        position: number;
        exerciseId: string;
        exerciseName?: string;
        note: string | null;
        sets: Array<{
          position: number;
          minRepetitions: number;
          maxRepetitions: number;
          suggestedLoad: number | null;
          restSeconds: number;
          warmup: boolean;
        }>;
      }>;
    }>;
  };
  mediciones: Array<{
    id: string;
    type: string;
    value: number;
    measuredOn: string;
  }>;
}

export interface RenewalWork {
  id: string;
  studentId: string;
  requestId: string | null;
  cycleStartsOn: Date;
  dueOn: Date;
  evaluation: RenewalEvaluation;
}

export interface RoutineRenewalsRepository {
  /** Creates due cycles once, captures evidence, and leases a bounded batch. */
  claimDue(evaluatedAt: Date): Promise<RenewalWork[]>;
  attachRequest(cycleId: string, requestId: string): Promise<void>;
  finalize(
    cycleId: string,
    evaluatedAt: Date,
  ): Promise<'generated' | 'waiting' | 'skipped'>;
  recordFailure(
    cycleId: string,
    message: string,
    evaluatedAt: Date,
  ): Promise<void>;
  release(cycleId: string, evaluatedAt: Date): Promise<void>;
}
