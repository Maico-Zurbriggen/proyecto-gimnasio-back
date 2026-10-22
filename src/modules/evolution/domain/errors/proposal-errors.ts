export class ProposalNotFoundError extends Error {
  constructor(message = 'Adaptation proposal not found') {
    super(message);
    this.name = 'ProposalNotFoundError';
  }
}

/** Una propuesta resuelta, caducada o invalidada no se reabre (D6 §5). */
export class ProposalNotPendingError extends Error {
  constructor(message = 'Adaptation proposal is not pending') {
    super(message);
    this.name = 'ProposalNotPendingError';
  }
}

export type InvalidResolutionCode =
  | 'partial_requires_subset'
  | 'unknown_adjustment'
  | 'rejection_reason_required';

export class InvalidResolutionError extends Error {
  constructor(readonly code: InvalidResolutionCode) {
    super(`Invalid proposal resolution: ${code}`);
    this.name = 'InvalidResolutionError';
  }
}

export class AdjustmentNotApplicableError extends Error {
  constructor(
    readonly adjustmentId: string,
    readonly reason: string,
  ) {
    super(`Adjustment ${adjustmentId} cannot be applied: ${reason}`);
    this.name = 'AdjustmentNotApplicableError';
  }
}

/** El criterio o el dato de un ajuste no cumple RN-84 / RF-090 (T1). */
export class InvalidAdjustmentEvidenceError extends Error {
  constructor(
    readonly field: 'criterion' | 'supportingData',
    readonly reason: string,
  ) {
    super(`Invalid adjustment evidence (${field}): ${reason}`);
    this.name = 'InvalidAdjustmentEvidenceError';
  }
}

/** La rutina sobre la que se diagnosticó ya no tiene una versión vigente. */
export class RoutineNotAvailableError extends Error {
  constructor(message = 'Routine for the proposal is not available') {
    super(message);
    this.name = 'RoutineNotAvailableError';
  }
}
