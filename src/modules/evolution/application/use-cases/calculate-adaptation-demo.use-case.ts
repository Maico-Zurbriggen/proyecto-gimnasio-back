import type { AdjustmentProposalsRepository } from '../ports/adjustment-proposals.repository';
import type { EvolutionDiagnosticsRepository } from '../ports/evolution-diagnostics.repository';
import {
  AdaptationDemoError,
  type AdaptationDemoScenario,
} from '../../domain/services/adaptation-demo';
import { DiagnoseEvolutionUseCase } from './diagnose-evolution.use-case';
import { ElaborateAdjustmentProposalUseCase } from './elaborate-adjustment-proposal.use-case';

/** Runs the ordinary application rules using ports scoped to the preparation transaction. */
export async function calculateAdaptationDemo(input: {
  studentId: string;
  scenario: AdaptationDemoScenario;
  previousDiagnosisAt: Date | null;
  now: Date;
  diagnostics: EvolutionDiagnosticsRepository;
  proposals: AdjustmentProposalsRepository;
}) {
  if (input.previousDiagnosisAt) {
    const previousDate = input.previousDiagnosisAt;
    await new DiagnoseEvolutionUseCase(input.diagnostics, {
      now: () => previousDate,
    }).execute(input.studentId);
  }
  const diagnostic = await new DiagnoseEvolutionUseCase(input.diagnostics, {
    now: () => input.now,
  }).execute(input.studentId);
  const proposal = await new ElaborateAdjustmentProposalUseCase(
    input.proposals,
    { now: () => input.now },
  ).execute({ diagnosticId: diagnostic.diagnosticId });
  if (
    input.scenario === 'ESTANCAMIENTO_SEGUNDO' &&
    proposal.status !== 'PROPUESTA'
  )
    throw new AdaptationDemoError('demo_alternative_required', 409);
  return { diagnostic, proposal };
}
