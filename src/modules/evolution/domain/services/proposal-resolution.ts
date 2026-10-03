import { InvalidResolutionError } from '../errors/proposal-errors';

export type ProposalDecision =
  'ACEPTADA_TOTAL' | 'ACEPTADA_PARCIAL' | 'RECHAZADA';

export type ReviewResult = 'APROBADA' | 'APROBADA_CON_CAMBIOS';

export interface ResolutionInput {
  decision: ProposalDecision;
  /** Todos los ajustes de la propuesta. */
  adjustmentIds: readonly string[];
  /** Ajustes que el entrenador acepta; sólo cuenta en la aceptación parcial. */
  acceptedAdjustmentIds?: readonly string[];
  reason?: string;
}

export interface ResolutionPlan {
  state: ProposalDecision;
  acceptedIds: string[];
  rejectedIds: string[];
  /** Revisión que registra la resolución favorable; `null` al rechazar. */
  reviewResult: ReviewResult | null;
  reason: string | null;
}

/**
 * Valida la decisión del entrenador sobre una propuesta (RN-86, RN-90).
 *
 * - Aceptación total: acepta todos los ajustes.
 * - Aceptación parcial: exige un subconjunto propio y no vacío de ajustes.
 * - Rechazo: exige motivo y no acepta ningún ajuste.
 */
export function planResolution(input: ResolutionInput): ResolutionPlan {
  const all = [...input.adjustmentIds];
  const reason = input.reason?.trim() ? input.reason.trim() : null;

  if (input.decision === 'RECHAZADA') {
    if (!reason) {
      throw new InvalidResolutionError('rejection_reason_required');
    }
    return {
      state: 'RECHAZADA',
      acceptedIds: [],
      rejectedIds: all,
      reviewResult: null,
      reason,
    };
  }

  if (input.decision === 'ACEPTADA_TOTAL') {
    return {
      state: 'ACEPTADA_TOTAL',
      acceptedIds: all,
      rejectedIds: [],
      reviewResult: 'APROBADA',
      reason,
    };
  }

  const accepted = new Set(input.acceptedAdjustmentIds ?? []);
  for (const id of accepted) {
    if (!all.includes(id)) {
      throw new InvalidResolutionError('unknown_adjustment');
    }
  }
  if (accepted.size === 0 || accepted.size === all.length) {
    throw new InvalidResolutionError('partial_requires_subset');
  }

  return {
    state: 'ACEPTADA_PARCIAL',
    acceptedIds: all.filter((id) => accepted.has(id)),
    rejectedIds: all.filter((id) => !accepted.has(id)),
    reviewResult: 'APROBADA_CON_CAMBIOS',
    reason,
  };
}
