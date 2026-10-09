import type { AuthUser } from '../../../../shared/types/auth';
import type { TrainingPurpose } from '../../../prescriptions/application/ports/prescriptions.repository';

export interface GoalRecord {
  id: string;
  type: TrainingPurpose;
  startsOn: Date;
  endsOn: Date | null;
}
export interface GoalContext {
  sufficient: boolean;
  missing: string[];
}
export interface GoalSnapshot {
  timezone: string;
  current: GoalRecord | null;
  history: GoalRecord[];
  atDate: GoalRecord | null;
  context: GoalContext;
}
export interface GoalsRepository {
  read(
    actor: AuthUser,
    studentId: string,
    at?: string,
  ): Promise<GoalSnapshot | null>;
  declare(
    actor: AuthUser,
    type: TrainingPurpose,
  ): Promise<{ goal: GoalRecord; changed: boolean; timezone: string } | null>;
}
