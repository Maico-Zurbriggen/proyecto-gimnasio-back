import type { Routine } from '../../domain/entities/routine.entity';

export interface RoutinesRepository {
  findActiveByStudentId(studentId: string): Promise<Routine | null>;
}
