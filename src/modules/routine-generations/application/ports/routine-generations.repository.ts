export interface RoutineGenerationSnapshot {
  requestId: string;
  status: string;
  estructuraCandidata: unknown | null;
  violaciones: string[] | null;
  error: string | null;
}

export interface GenerationRequestRecord {
  requestId: string;
  idempotencyKey: string;
  status: string;
}

export interface CreateGenerationRequestInput {
  idempotencyKey: string;
  minimizedContext: Record<string, unknown>;
  preferences: Record<string, unknown>;
  contextHash: string;
  retentionUntil: Date;
  studentId: string;
  requestedByUserId: string;
}

export interface GenerationRequestOwner {
  studentId: string;
}

export interface RoutineGenerationsRepository {
  findById(requestId: string): Promise<RoutineGenerationSnapshot | null>;
  findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<GenerationRequestRecord | null>;
  create(input: CreateGenerationRequestInput): Promise<GenerationRequestRecord>;
  findRequestOwner(requestId: string): Promise<GenerationRequestOwner | null>;
}
