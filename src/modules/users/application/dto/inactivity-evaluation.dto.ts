import type { UserDomainState } from '../../domain/entities/user.entity';

export interface InactivityEvaluationResultDto {
  userId: string;
  state: UserDomainState;
  blocked: boolean;
  consecutiveFaltas: number;
  monthsInactive: number;
  reason?: string;
}
