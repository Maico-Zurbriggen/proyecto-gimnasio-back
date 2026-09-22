import type { RoutineGenerationOwner } from './routine-generations.repository';

export interface FinalizedGeneratedRoutine {
  routineId: string;
  status: 'PROPUESTA';
}

export interface GeneratedRoutinesRepository {
  finalize(owner: RoutineGenerationOwner): Promise<FinalizedGeneratedRoutine>;
}
