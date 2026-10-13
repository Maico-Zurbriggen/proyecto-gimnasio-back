import type { Clock } from '../../../routines/application/ports/clock';
import type { RoutineGenerationGateway } from '../../../routine-generations/application/ports/routine-generation.gateway';
import type { RequestRoutineGenerationUseCase } from '../../../routine-generations/application/use-cases/request-routine-generation.use-case';
import type { EvaluateMeasurementCheckpointsUseCase } from '../../../students/application/use-cases/evaluate-measurement-checkpoints.use-case';
import type {
  RoutineRenewalsRepository,
  RenewalWork,
} from '../ports/routine-renewals.repository';

export function renewalEvidence(
  cycle: Pick<RenewalWork, 'cycleStartsOn' | 'dueOn' | 'evaluation'>,
) {
  return {
    starts_on: cycle.cycleStartsOn.toISOString().slice(0, 10),
    due_on: cycle.dueOn.toISOString().slice(0, 10),
    criterion: cycle.evaluation.criterio,
    without_updated_measurements: cycle.evaluation.sinDatosActualizados,
    missing_information: cycle.evaluation.sinDatosActualizados
      ? 'Medición corporal posterior al inicio del ciclo'
      : null,
    measurements: cycle.evaluation.mediciones.map((measurement) => ({
      type: measurement.type,
      value: measurement.value,
      measured_on: measurement.measuredOn,
    })),
  };
}

export class RenewRoutineCyclesUseCase {
  constructor(
    private readonly renewals: RoutineRenewalsRepository,
    private readonly checkpoints: EvaluateMeasurementCheckpointsUseCase,
    private readonly requestGeneration: RequestRoutineGenerationUseCase,
    private readonly gateway: RoutineGenerationGateway,
    private readonly clock: Clock,
  ) {}

  async execute() {
    // Blocking and missed-cycle accounting advance even when the AI service is down.
    const measurementControls = await this.checkpoints.execute();
    if (measurementControls.skippedConcurrentRun)
      return {
        cyclesProcessed: 0,
        requestsDispatched: 0,
        proposalsGenerated: 0,
        failures: 0,
        measurementControls,
      };
    const now = this.clock.now();
    const cycles = await this.renewals.claimDue(now);
    const result = {
      cyclesProcessed: cycles.length,
      requestsDispatched: 0,
      proposalsGenerated: 0,
      failures: 0,
      measurementControls,
    };

    for (const cycle of cycles) {
      try {
        let requestId = cycle.requestId;
        if (!requestId) {
          const request = await this.requestGeneration.execute({
            studentId: cycle.studentId,
            requestedByUserId: cycle.studentId,
            generationTask: {
              kind: 'AUTOMATIC_RENEWAL',
              cycle: renewalEvidence(cycle),
            },
            routineRenewal: true,
            routineRenewalStructure:
              cycle.evaluation.estructuraVigente ?? undefined,
            idempotencyKey: `routine-renewal:${cycle.id}:structure-distribution-v3`,
            deferDispatch: true,
          });
          requestId = request.requestId;
          await this.renewals.attachRequest(cycle.id, requestId);
        }
        const outcome = await this.renewals.finalize(cycle.id, now);
        if (outcome === 'generated') result.proposalsGenerated++;
        else if (outcome === 'waiting') {
          await this.gateway.dispatchGeneration(requestId);
          result.requestsDispatched++;
        }
      } catch (error) {
        result.failures++;
        await this.renewals.recordFailure(
          cycle.id,
          error instanceof Error ? error.message : 'generation_failed',
          now,
        );
      } finally {
        await this.renewals.release(cycle.id, this.clock.now());
      }
    }
    return result;
  }
}
