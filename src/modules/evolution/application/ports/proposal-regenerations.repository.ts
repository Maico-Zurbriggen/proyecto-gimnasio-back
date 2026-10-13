import type { RenewalEvaluation } from './routine-renewals.repository';
import type { RoutineRenewalStructureInput } from '../../../routine-generations/application/dto/routine-generation-context.dto';

export interface ProposalRegeneration {
  id: string;
  proposalId: string;
  trainerId: string;
  feedback: string;
  candidateRequestId: string;
  requestId: string | null;
  state: string;
  error: string | null;
}
export interface ProposalRegenerationSource {
  studentId: string;
  evaluation: RenewalEvaluation;
  previousCandidate: RoutineRenewalStructureInput;
  cycleStartsOn: Date;
  dueOn: Date;
}
export interface ProposalRegenerationsRepository {
  reserve(input: {
    proposalId: string;
    trainerId: string;
    idempotencyKey: string;
    candidateRequestId: string;
    feedback: string;
    now: Date;
  }): Promise<{
    regeneration: ProposalRegeneration;
    source: ProposalRegenerationSource;
  }>;
  latest(proposalId: string): Promise<ProposalRegeneration | null>;
  attach(id: string, requestId: string): Promise<void>;
  finish(id: string, now: Date): Promise<ProposalRegeneration>;
  fail(id: string, message: string, now: Date): Promise<void>;
}
