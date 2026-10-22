import type { AuthUser } from '../../../shared/types/auth';
import type { Clock } from '../../routines/application/ports/clock';
import type { TrainerAssignments } from '../../students/application/ports/trainer-assignments.port';
import { SessionAccessError } from '../../training-sessions/domain/errors';
import {
  presentMuscleActivity,
  type ExerciseActivity,
  type MuscleAggregate,
} from '../domain/muscle-activity';

export interface MuscleActivityRepository {
  aggregate(input: {
    actor: AuthUser;
    studentId: string;
    from: string;
    to: string;
    now: Date;
  }): Promise<{
    timezone: string;
    sessionCount: number;
    aggregates: MuscleAggregate[];
    exercises: ExerciseActivity[];
  } | null>;
}

export class GetMuscleActivityUseCase {
  constructor(
    private readonly repository: MuscleActivityRepository,
    private readonly assignments: TrainerAssignments,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthUser,
    studentId: string,
    period: { from: string; to: string },
  ) {
    if (
      !(actor.roles.includes('ALUMNO') && actor.id === studentId) &&
      !(
        actor.roles.includes('ENTRENADOR') &&
        (await this.assignments.isActive(actor.id, studentId))
      )
    )
      throw new SessionAccessError();
    const result = await this.repository.aggregate({
      actor,
      studentId,
      ...period,
      now: this.clock.now(),
    });
    if (!result) throw new SessionAccessError();
    return {
      studentId,
      ...period,
      timezone: result.timezone,
      sessionCount: result.sessionCount,
      ...presentMuscleActivity(
        result.sessionCount,
        result.aggregates,
        result.exercises,
      ),
      calculatedAt: this.clock.now().toISOString(),
    };
  }
}
