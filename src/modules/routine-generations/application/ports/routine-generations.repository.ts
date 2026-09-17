export interface RoutineGenerationSnapshot {
  requestId: string;
  status: string;
  estructuraCandidata: unknown | null;
  violaciones: string[] | null;
  error: string | null;
}

export interface RoutineGenerationsRepository {
  findById(requestId: string): Promise<RoutineGenerationSnapshot | null>;
}
