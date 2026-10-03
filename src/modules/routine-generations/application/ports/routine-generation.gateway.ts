export interface RoutineGenerationGateway {
  dispatchGeneration(requestId: string): Promise<void>;
}
