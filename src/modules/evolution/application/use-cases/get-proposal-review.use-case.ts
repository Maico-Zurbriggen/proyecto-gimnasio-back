import type { TrainerAssignments } from '../../../students/application/ports/trainer-assignments.port';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import { ProposalNotFoundError } from '../../domain/errors/proposal-errors';
import {
  toProposalReviewDto,
  type ProposalReviewDto,
} from '../dto/proposal.dto';
import type { ProposalsRepository } from '../ports/proposals.repository';

/** Payload de revisión de una propuesta (HU04 - T1). */
export class GetProposalReviewUseCase {
  constructor(
    private readonly proposals: ProposalsRepository,
    private readonly assignments: TrainerAssignments,
  ) {}

  async execute(query: {
    trainerId: string;
    proposalId: string;
  }): Promise<ProposalReviewDto> {
    const record = await this.proposals.findById(query.proposalId);
    if (!record) {
      throw new ProposalNotFoundError();
    }
    if (
      !(await this.assignments.isActive(query.trainerId, record.student.id))
    ) {
      throw new TrainerNotAssignedError();
    }

    return toProposalReviewDto(record);
  }
}
