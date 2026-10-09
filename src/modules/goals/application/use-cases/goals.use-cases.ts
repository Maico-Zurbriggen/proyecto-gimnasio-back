import type { AuthUser } from '../../../../shared/types/auth';
import type { TrainingPurpose } from '../../../prescriptions/application/ports/prescriptions.repository';
import type { GoalsRepository } from '../ports/goals.repository';

export class GoalAccessError extends Error {}
export class GoalsUseCases {
  constructor(private readonly goals: GoalsRepository) {}
  async read(actor: AuthUser, studentId: string, at?: string) {
    if (
      !(actor.id === studentId && actor.roles.includes('ALUMNO')) &&
      !actor.roles.includes('ENTRENADOR')
    )
      throw new GoalAccessError();
    const snapshot = await this.goals.read(actor, studentId, at);
    if (!snapshot) throw new GoalAccessError();
    return snapshot;
  }
  async declare(actor: AuthUser, studentId: string, type: TrainingPurpose) {
    if (actor.id !== studentId || !actor.roles.includes('ALUMNO'))
      throw new GoalAccessError();
    const result = await this.goals.declare(actor, type);
    if (!result) throw new GoalAccessError();
    return result;
  }
}
