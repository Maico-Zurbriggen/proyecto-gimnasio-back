import type { Clock } from '../../../routines/application/ports/clock';
import type { TrainerAssignments } from '../../../students/application/ports/trainer-assignments.port';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import {
  ProposalNotFoundError,
  ProposalNotPendingError,
  RoutineNotAvailableError,
} from '../../domain/errors/proposal-errors';
import {
  applyAdjustments,
  type RoutineDayPlan,
} from '../../domain/services/apply-adjustments';
import {
  planResolution,
  type ProposalDecision,
} from '../../domain/services/proposal-resolution';
import type { ProposalResolutionDto } from '../dto/proposal.dto';
import type { ProposalsRepository } from '../ports/proposals.repository';

export interface ResolveProposalInput {
  trainerId: string;
  proposalId: string;
  decision: ProposalDecision;
  acceptedAdjustmentIds?: string[];
  reason?: string;
}

/**
 * Resolución de una propuesta por el entrenador (HU04 - T3, FL-10).
 *
 * Aceptar genera una versión nueva con los ajustes aceptados y conserva íntegra la
 * anterior (RN-88); la resolución es la revisión y no se pide otra (RN-35a). La
 * revisión favorable que se registra reinicia el ciclo de renovación. Rechazar no
 * genera versión y registra el motivo (RN-90).
 */
export class ResolveProposalUseCase {
  constructor(
    private readonly proposals: ProposalsRepository,
    private readonly assignments: TrainerAssignments,
    private readonly clock: Clock,
  ) {}

  async execute(input: ResolveProposalInput): Promise<ProposalResolutionDto> {
    const record = await this.proposals.findById(input.proposalId);
    if (!record) {
      throw new ProposalNotFoundError();
    }
    if (
      !(await this.assignments.isActive(input.trainerId, record.student.id))
    ) {
      throw new TrainerNotAssignedError();
    }
    if (record.state !== 'PENDIENTE') {
      throw new ProposalNotPendingError();
    }

    const plan = planResolution({
      decision: input.decision,
      adjustmentIds: record.adjustments.map((adjustment) => adjustment.id),
      acceptedAdjustmentIds: input.acceptedAdjustmentIds,
      reason: input.reason,
    });

    let routineId: string | null = null;
    let newVersionDays: RoutineDayPlan[] | null = null;

    if (plan.reviewResult) {
      const current = record.routine
        ? await this.proposals.findCurrentVersion(record.routine.id)
        : null;
      if (!current) {
        throw new RoutineNotAvailableError();
      }
      routineId = current.routineId;
      newVersionDays = applyAdjustments(
        current.days,
        record.adjustments.filter((adjustment) =>
          plan.acceptedIds.includes(adjustment.id),
        ),
      );
    }

    const result = await this.proposals.persistResolution({
      proposalId: record.id,
      trainerId: input.trainerId,
      studentId: record.student.id,
      plan,
      routineId,
      newVersionDays,
      resolvedAt: this.clock.now(),
    });
    if (!result.resolved) {
      throw new ProposalNotPendingError();
    }

    return {
      proposalId: record.id,
      state: plan.state,
      resultingVersionNumber: result.resultingVersionNumber,
    };
  }
}
