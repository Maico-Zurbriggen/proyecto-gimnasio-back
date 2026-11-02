import type {
  DiagnosticInput,
  Elaboration,
} from '../../domain/services/adjustment-table';

export interface DeliveredProposal {
  proposalId: string;
  state: 'PENDIENTE' | 'BLOQUEADA';
  /** true si el diagnóstico ya tenía propuesta (reejecución idempotente). */
  alreadyExisted: boolean;
}

export interface AdjustmentProposalsRepository {
  /** Carga el diagnóstico con lo que necesita la tabla; null si no existe. */
  loadDiagnostic(diagnosticId: string): Promise<DiagnosticInput | null>;
  /** Propuesta ya entregada para el diagnóstico, si existe. */
  findProposalByDiagnostic(
    diagnosticId: string,
  ): Promise<DeliveredProposal | null>;
  /**
   * Entrega la propuesta a Evolution (T3): PENDIENTE con ajustes PENDIENTE y
   * aviso al entrenador; BLOQUEADA con aviso al administrador si el alumno no
   * tiene entrenador vigente. Idempotente por diagnóstico.
   */
  deliver(input: {
    diagnosticId: string;
    elaboration: Elaboration;
    componentVersion: string;
    at: Date;
  }): Promise<DeliveredProposal>;
}
