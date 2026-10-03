import type {
  FinalizedGeneratedRoutine,
  GeneratedRoutinesRepository,
} from '../ports/generated-routines.repository';
import type { RoutineGenerationOwner } from '../ports/routine-generations.repository';

export class FinalizeRoutineGenerationUseCase {
  constructor(private readonly repository: GeneratedRoutinesRepository) {}

  execute(owner: RoutineGenerationOwner): Promise<FinalizedGeneratedRoutine> {
    return this.repository.finalize(owner);
  }
}
