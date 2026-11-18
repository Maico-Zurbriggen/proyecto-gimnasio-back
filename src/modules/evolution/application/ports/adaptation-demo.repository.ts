import type { AdaptationDemoScenario } from '../../domain/services/adaptation-demo';
import type { EvolutionSituation } from '../../domain/services/adjustment-table';

export interface AdaptationDemoResult {
  runId: string;
  studentId: string;
  scenario: AdaptationDemoScenario;
  diagnosticId: string;
  globalSituation: EvolutionSituation;
  proposalId: string | null;
  proposalState: string | null;
  proposalStatus: 'PROPUESTA' | 'SIN_AJUSTES' | 'DATOS_INSUFICIENTES';
  preparedOn: string;
  reused: boolean;
}

export interface AdaptationDemoStudent {
  studentId: string;
  displayName: string;
  hasCurrentRoutine: boolean;
  activeRun: AdaptationDemoResult | null;
}

export interface AdaptationDemoActor {
  trainerId: string;
  gymId: string;
}

export interface AdaptationDemoRepository {
  list(actor: AdaptationDemoActor): Promise<AdaptationDemoStudent[]>;
  prepare(
    actor: AdaptationDemoActor,
    studentId: string,
    scenario: AdaptationDemoScenario,
    now: Date,
  ): Promise<AdaptationDemoResult>;
  restore(
    actor: AdaptationDemoActor,
    studentId: string,
    now: Date,
  ): Promise<{ restored: boolean }>;
}
