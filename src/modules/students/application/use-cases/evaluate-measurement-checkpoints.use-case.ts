import type { Clock } from '../../../routines/application/ports/clock';
import type {
  MeasurementCheckpointEvaluationResult,
  MeasurementCheckpointsRepository,
} from '../ports/measurement-checkpoints.repository';

export class EvaluateMeasurementCheckpointsUseCase {
  constructor(
    private readonly checkpoints: MeasurementCheckpointsRepository,
    private readonly clock: Clock,
  ) {}

  execute(): Promise<MeasurementCheckpointEvaluationResult> {
    return this.checkpoints.evaluateDueCycles(this.clock.now());
  }
}
