import type { Clock } from '../../../routines/application/ports/clock';
import type { TrainerAssignments } from '../../../students/application/ports/trainer-assignments.port';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import {
  AdaptationDemoError,
  type AdaptationDemoScenario,
} from '../../domain/services/adaptation-demo';
import type {
  AdaptationDemoActor,
  AdaptationDemoRepository,
} from '../ports/adaptation-demo.repository';

export class AdaptationDemoUseCases {
  constructor(
    private readonly repository: AdaptationDemoRepository,
    private readonly assignments: TrainerAssignments,
    private readonly clock: Clock,
    private readonly enabled: boolean,
  ) {}

  private requireEnabled() {
    if (!this.enabled)
      throw new AdaptationDemoError('adaptation_demo_disabled', 404);
  }

  list(actor: AdaptationDemoActor) {
    this.requireEnabled();
    return this.repository.list(actor);
  }

  private async requireAssignment(
    actor: AdaptationDemoActor,
    studentId: string,
  ) {
    this.requireEnabled();
    if (!(await this.assignments.isActive(actor.trainerId, studentId)))
      throw new TrainerNotAssignedError();
  }

  async prepare(
    actor: AdaptationDemoActor,
    studentId: string,
    scenario: AdaptationDemoScenario,
  ) {
    await this.requireAssignment(actor, studentId);
    return this.repository.prepare(
      actor,
      studentId,
      scenario,
      this.clock.now(),
    );
  }

  async restore(actor: AdaptationDemoActor, studentId: string) {
    await this.requireAssignment(actor, studentId);
    return this.repository.restore(actor, studentId, this.clock.now());
  }
}
