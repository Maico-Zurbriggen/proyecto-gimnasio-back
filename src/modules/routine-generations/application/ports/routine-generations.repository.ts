import type {
  MinimizedContext,
  RoutineGenerationPreferences,
} from '../dto/routine-generation-context.dto';

export interface RoutineGenerationSnapshot {
  requestId: string;
  status: string;
  estructuraCandidata: unknown | null;
  violaciones: string[] | null;
  error: string | null;
  routineId: string | null;
  reason?: string | null;
}

export interface RoutineGenerationOwner {
  requestId: string;
  studentId: string;
  requestedByUserId: string;
}

export interface CreateRoutineGenerationRequest {
  ownership?: { studentId: string; requestedByUserId: string };
  idempotencyKey: string;
  minimizedContext: MinimizedContext;
  preferences: RoutineGenerationPreferences;
  retentionUntil: Date;
}

export interface StoredRoutineGenerationRequest {
  requestId: string;
  status: string;
  alreadyExisted: boolean;
}

export interface RoutineGenerationsRepository {
  findProposedRoutineId(studentId: string): Promise<string | null>;
  createOrGetRequest(
    input: CreateRoutineGenerationRequest,
  ): Promise<StoredRoutineGenerationRequest>;
  registerOwnership(owner: RoutineGenerationOwner): Promise<void>;
  findById(
    owner: RoutineGenerationOwner,
  ): Promise<RoutineGenerationSnapshot | null>;
}
