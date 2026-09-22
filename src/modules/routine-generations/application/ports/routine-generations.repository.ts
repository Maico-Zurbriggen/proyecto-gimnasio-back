export interface RoutineGenerationSnapshot {
  requestId: string;
  status: string;
  estructuraCandidata: unknown | null;
  violaciones: string[] | null;
  error: string | null;
  routineId: string | null;
}

export interface RoutineGenerationOwner {
  requestId: string;
  studentId: string;
  requestedByUserId: string;
}

export interface RoutineGenerationsRepository {
  registerOwnership(owner: RoutineGenerationOwner): Promise<void>;
  findById(
    owner: RoutineGenerationOwner,
  ): Promise<RoutineGenerationSnapshot | null>;
}
