export interface MeasurementCheckpointEvaluationResult {
  checkpointsCreated: number;
  blocksCreated: number;
  skippedConcurrentRun: boolean;
}

export interface MeasurementCheckpointsRepository {
  evaluateDueCycles(
    evaluatedAt: Date,
  ): Promise<MeasurementCheckpointEvaluationResult>;
}
