export interface DispatchGenerationResult {
  requestId: string;
  status: string;
}

export interface RoutineGenerationAcceptedResult {
  requestId: string;
  status: string;
  alreadyExisted: boolean;
}

export interface RoutineGenerationGateway {
  dispatchGeneration(requestId: string): Promise<DispatchGenerationResult>;
}
