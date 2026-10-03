import { RoutineGenerationNotFoundError } from '../../domain/errors/routine-generation-errors';
import type { RoutineGenerationSnapshot } from '../ports/routine-generations.repository';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';

export interface GetRoutineGenerationQuery {
  requestId: string;
  studentId: string;
  requestedByUserId: string;
}

export class GetRoutineGenerationUseCase {
  constructor(
    private readonly routineGenerationsRepository: RoutineGenerationsRepository,
  ) {}

  async execute(
    query: GetRoutineGenerationQuery,
  ): Promise<RoutineGenerationSnapshot> {
    const snapshot = await this.routineGenerationsRepository.findById(query);

    if (!snapshot) {
      throw new RoutineGenerationNotFoundError(
        `Routine generation request ${query.requestId} not found`,
      );
    }

    return snapshot;
  }
}
