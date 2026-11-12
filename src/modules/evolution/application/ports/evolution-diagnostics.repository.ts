import type {
  DiagnosticSession,
  EvolutionSituation,
} from '../../domain/services/evolution-diagnostic';

export interface DueRoutineDiagnostic {
  studentId: string;
  routineVersionId: string;
  exercises: Array<{ exerciseId: string; sessions: DiagnosticSession[] }>;
}

export interface SaveEvolutionDiagnostic {
  studentId: string;
  routineVersionId: string;
  periodStart: Date;
  periodEnd: Date;
  globalSituation: EvolutionSituation;
  adherence: number | null;
  criteriaNotEvaluated: string[];
  globalFindings: Record<string, unknown>;
  exercises: Array<{
    exerciseId: string;
    situation: EvolutionSituation;
    metrics: Record<string, unknown>;
  }>;
  calculatedAt: Date;
  notBefore: Date;
}

export interface EvolutionDiagnosticsRepository {
  findDue(cutoff: Date, periodStart: Date): Promise<DueRoutineDiagnostic[]>;
  saveIfDue(input: SaveEvolutionDiagnostic): Promise<boolean>;
}
