import type {
  CatalogExerciseRef,
  MinimizedContext,
  RoutineGenerationParameters,
} from '../dto/routine-generation-context.dto';

export interface RoutineGenerationRequestPayload {
  idempotencyKey: string;
  gymId: string;
  studentId: string;
  requestedByUserId: string;
  freeText: string | null;
  parameters: RoutineGenerationParameters | null;
  prefilteredCatalog: CatalogExerciseRef[];
  minimizedContext: MinimizedContext;
}

export interface RoutineGenerationAcceptedResult {
  requestId: string;
  status: string;
  alreadyExisted: boolean;
}

export interface RoutineGenerationGateway {
  requestGeneration(
    payload: RoutineGenerationRequestPayload,
  ): Promise<RoutineGenerationAcceptedResult>;
}
