import { RoutineGenerationNotFoundError } from '../../domain/errors/routine-generation-errors';
import type { RoutineGenerationSnapshot } from '../ports/routine-generations.repository';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';

export interface GetRoutineGenerationQuery {
  requestId: string;
  /**
   * Alumno que consulta. Cuando se informa, la solicitud debe pertenecerle;
   * cualquier otro caso responde como inexistente para no revelar existencia.
   */
  requesterStudentId?: string | null;
}

export class GetRoutineGenerationUseCase {
  constructor(
    private readonly routineGenerationsRepository: RoutineGenerationsRepository,
  ) {}

  async execute(
    query: GetRoutineGenerationQuery,
  ): Promise<RoutineGenerationSnapshot> {
    if (query.requesterStudentId) {
      const owner = await this.routineGenerationsRepository.findRequestOwner(
        query.requestId,
      );
      if (!owner || owner.studentId !== query.requesterStudentId) {
        throw new RoutineGenerationNotFoundError(
          `Routine generation request ${query.requestId} not found`,
        );
      }
    }

    const snapshot = await this.routineGenerationsRepository.findById(
      query.requestId,
    );

    if (!snapshot) {
      throw new RoutineGenerationNotFoundError(
        `Routine generation request ${query.requestId} not found`,
      );
    }

    return snapshot;
  }
}
