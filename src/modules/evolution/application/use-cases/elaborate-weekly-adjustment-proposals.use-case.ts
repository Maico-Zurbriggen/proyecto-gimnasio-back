import type { Clock } from '../../../routines/application/ports/clock';
import type { AdjustmentProposalsRepository } from '../ports/adjustment-proposals.repository';
import type { ElaborateAdjustmentProposalUseCase } from './elaborate-adjustment-proposal.use-case';

/** Ventana con margen sobre la semana para no perder diagnósticos si falla un corrido. */
const LOOKBACK_DAYS = 8;

export interface WeeklyAdjustmentProposalsResult {
  scanned: number;
  proposed: number;
  withoutAdjustments: number;
  failed: number;
}

/**
 * Job semanal: elabora la propuesta de ajuste de los diagnósticos recientes que
 * todavía no tienen una. Es idempotente (la propuesta es única por diagnóstico)
 * y un diagnóstico que falla no frena al resto.
 */
export class ElaborateWeeklyAdjustmentProposalsUseCase {
  constructor(
    private readonly repository: AdjustmentProposalsRepository,
    private readonly elaborate: Pick<
      ElaborateAdjustmentProposalUseCase,
      'execute'
    >,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<WeeklyAdjustmentProposalsResult> {
    const since = new Date(
      this.clock.now().getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const ids = await this.repository.listDiagnosticIdsWithoutProposal(since);
    const result: WeeklyAdjustmentProposalsResult = {
      scanned: ids.length,
      proposed: 0,
      withoutAdjustments: 0,
      failed: 0,
    };
    for (const diagnosticId of ids) {
      try {
        const outcome = await this.elaborate.execute({ diagnosticId });
        if (outcome.proposalId && !outcome.alreadyExisted) result.proposed += 1;
        else if (!outcome.proposalId) result.withoutAdjustments += 1;
      } catch (error) {
        result.failed += 1;
        console.error('adjustment-proposals job failed', diagnosticId, error);
      }
    }
    return result;
  }
}
