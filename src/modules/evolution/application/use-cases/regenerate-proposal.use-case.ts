import type { TrainerAssignments } from '../../../students/application/ports/trainer-assignments.port';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import type { RequestRoutineGenerationUseCase } from '../../../routine-generations/application/use-cases/request-routine-generation.use-case';
import type { RoutineGenerationGateway } from '../../../routine-generations/application/ports/routine-generation.gateway';
import type { Clock } from '../../../routines/application/ports/clock';
import type { ProposalsRepository } from '../ports/proposals.repository';
import type { ProposalRegenerationsRepository } from '../ports/proposal-regenerations.repository';
import { ProposalNotFoundError } from '../../domain/errors/proposal-errors';
import { renewalEvidence } from './renew-routine-cycles.use-case';

export class RegenerateProposalUseCase {
  constructor(
    private readonly repository: ProposalRegenerationsRepository,
    private readonly proposals: ProposalsRepository,
    private readonly assignments: TrainerAssignments,
    private readonly generation: RequestRoutineGenerationUseCase,
    private readonly gateway: RoutineGenerationGateway,
    private readonly clock: Clock,
  ) {}

  private async authorize(proposalId: string, trainerId: string) {
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal) throw new ProposalNotFoundError();
    if (!(await this.assignments.isActive(trainerId, proposal.student.id)))
      throw new TrainerNotAssignedError();
    return proposal;
  }

  async start(input: {
    proposalId: string;
    trainerId: string;
    idempotencyKey: string;
    candidateRequestId: string;
    feedback: string;
  }) {
    await this.authorize(input.proposalId, input.trainerId);
    const { regeneration, source } = await this.repository.reserve({
      ...input,
      now: this.clock.now(),
    });
    if (regeneration.state !== 'PENDIENTE') return regeneration;
    try {
      let requestId = regeneration.requestId;
      if (!requestId) {
        const request = await this.generation.execute({
          studentId: source.studentId,
          requestedByUserId: input.trainerId,
          idempotencyKey: `proposal-regeneration:${regeneration.id}`,
          routineRenewal: true,
          routineRenewalStructure: source.evaluation.estructuraVigente,
          deferDispatch: true,
          generationTask: {
            kind: 'TRAINER_REGENERATION',
            cycle: renewalEvidence({
              cycleStartsOn: source.cycleStartsOn,
              dueOn: source.dueOn,
              evaluation: source.evaluation,
            }),
            trainer_feedback: regeneration.feedback,
            previous_candidate: source.previousCandidate,
          },
        });
        requestId = request.requestId;
        await this.repository.attach(regeneration.id, requestId);
      }
      await this.gateway.dispatchGeneration(requestId);
    } catch (error) {
      await this.repository.fail(
        regeneration.id,
        error instanceof Error ? error.message : 'ai_service_unavailable',
        this.clock.now(),
      );
    }
    return this.repository.latest(input.proposalId);
  }

  async status(proposalId: string, trainerId: string) {
    await this.authorize(proposalId, trainerId);
    const latest = await this.repository.latest(proposalId);
    if (!latest || latest.state !== 'PENDIENTE') return latest;
    try {
      // Recover a process interruption, or clear the reservation if its context no longer applies.
      if (!latest.requestId)
        return await this.start({
          ...latest,
          idempotencyKey: `resume:${latest.id}`,
        });
      return await this.repository.finish(latest.id, this.clock.now());
    } catch (error) {
      await this.repository.fail(
        latest.id,
        error instanceof Error ? error.message : 'invalid_generated_routine',
        this.clock.now(),
      );
      return this.repository.latest(proposalId);
    }
  }
}
