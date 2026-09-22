import { RoutineGenerationNotFoundError } from '../../domain/errors/routine-generation-errors';
import type { LatestRoutineGenerationRepository } from '../ports/latest-routine-generation.repository';
import type { RoutineGenerationSnapshot } from '../ports/routine-generations.repository';

export class GetLatestRoutineGenerationUseCase {
  constructor(private readonly repository: LatestRoutineGenerationRepository) {}

  async execute(studentId: string): Promise<RoutineGenerationSnapshot> {
    const snapshot = await this.repository.findLatestByStudentId(studentId);

    if (!snapshot) {
      throw new RoutineGenerationNotFoundError(
        `No routine generation request found for student ${studentId}`,
      );
    }

    return snapshot;
  }
}
