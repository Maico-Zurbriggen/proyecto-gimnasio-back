import {
  ADJUSTMENT_TABLE_VERSION,
  elaborateAdjustments,
  type DeclaredOmission,
  type ElaborationStatus,
} from '../../domain/services/adjustment-table';
import type { AdjustmentProposalsRepository } from '../ports/adjustment-proposals.repository';

export class DiagnosticNotFoundError extends Error {
  constructor(diagnosticId: string) {
    super(`Diagnostic ${diagnosticId} not found`);
    this.name = 'DiagnosticNotFoundError';
  }
}

export interface ElaborateAdjustmentProposalResult {
  status: ElaborationStatus;
  proposalId: string | null;
  proposalState: 'PENDIENTE' | 'BLOQUEADA' | null;
  alreadyExisted: boolean;
  declared: DeclaredOmission[];
}

/**
 * Convierte un diagnóstico en una propuesta de ajuste acotada y la entrega a
 * Evolution (HU de tabla situación → ajuste). Cada propuesta deriva de un único
 * diagnóstico (RN-83) y nunca se aplica sin resolución del entrenador (RN-86).
 */
export class ElaborateAdjustmentProposalUseCase {
  constructor(
    private readonly repository: AdjustmentProposalsRepository,
    private readonly clock: { now(): Date },
  ) {}

  async execute(command: {
    diagnosticId: string;
  }): Promise<ElaborateAdjustmentProposalResult> {
    const existing = await this.repository.findProposalByDiagnostic(
      command.diagnosticId,
    );
    if (existing) {
      return {
        status: 'PROPUESTA',
        proposalId: existing.proposalId,
        proposalState: existing.state,
        alreadyExisted: true,
        declared: [],
      };
    }

    const diagnostic = await this.repository.loadDiagnostic(
      command.diagnosticId,
    );
    if (!diagnostic) throw new DiagnosticNotFoundError(command.diagnosticId);

    const elaboration = elaborateAdjustments(diagnostic);
    if (elaboration.status !== 'PROPUESTA') {
      // El diagnóstico ya está registrado; sin ajustes no hay propuesta.
      return {
        status: elaboration.status,
        proposalId: null,
        proposalState: null,
        alreadyExisted: false,
        declared: elaboration.declared,
      };
    }

    const delivered = await this.repository.deliver({
      diagnosticId: command.diagnosticId,
      elaboration,
      componentVersion: ADJUSTMENT_TABLE_VERSION,
      at: this.clock.now(),
    });
    return {
      status: 'PROPUESTA',
      proposalId: delivered.proposalId,
      proposalState: delivered.state,
      alreadyExisted: delivered.alreadyExisted,
      declared: elaboration.declared,
    };
  }
}
