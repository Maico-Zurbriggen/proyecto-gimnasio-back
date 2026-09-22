import type { RoutineGenerationSnapshot } from './routine-generations.repository';

export interface LatestRoutineGenerationRepository {
  findLatestByStudentId(
    studentId: string,
  ): Promise<RoutineGenerationSnapshot | null>;
}
