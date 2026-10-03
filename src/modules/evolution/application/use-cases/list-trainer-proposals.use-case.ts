import {
  toProposalSummaryDto,
  type ProposalSummaryDto,
} from '../dto/proposal.dto';
import type { ProposalsRepository } from '../ports/proposals.repository';

/** Propuestas PENDIENTES de los alumnos con asignación vigente del entrenador. */
export class ListTrainerProposalsUseCase {
  constructor(private readonly proposals: ProposalsRepository) {}

  async execute(query: { trainerId: string }): Promise<ProposalSummaryDto[]> {
    const records = await this.proposals.findPendingForTrainer(query.trainerId);
    return records.map(toProposalSummaryDto);
  }
}
