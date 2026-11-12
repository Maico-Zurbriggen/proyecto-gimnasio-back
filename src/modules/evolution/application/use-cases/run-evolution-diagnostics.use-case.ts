import type { Clock } from '../../../routines/application/ports/clock';
import { GetAdherenceUseCase } from '../../../indicators/application/indicators.use-cases';
import type { IndicatorsRepository } from '../../../indicators/application/indicators.use-cases';
import {
  diagnoseExercise,
  globalSituation,
} from '../../domain/services/evolution-diagnostic';
import type { EvolutionDiagnosticsRepository } from '../ports/evolution-diagnostics.repository';

const PERIOD_DAYS = 42;
const FREQUENCY_DAYS = 14;

export interface EvolutionDiagnosticsJobResult {
  scanned: number;
  created: number;
  skipped: number;
  failed: number;
}

/** Se invoca diariamente, pero persiste como máximo un diagnóstico cada 14 días. */
export class RunEvolutionDiagnosticsUseCase {
  private readonly adherence: GetAdherenceUseCase;

  constructor(
    private readonly repository: EvolutionDiagnosticsRepository,
    indicators: IndicatorsRepository,
    private readonly clock: Clock,
  ) {
    this.adherence = new GetAdherenceUseCase(indicators, clock);
  }

  async execute(): Promise<EvolutionDiagnosticsJobResult> {
    const now = this.clock.now();
    const cutoff = new Date(
      now.getTime() - FREQUENCY_DAYS * 24 * 60 * 60 * 1000,
    );
    const periodStart = new Date(
      now.getTime() - PERIOD_DAYS * 24 * 60 * 60 * 1000,
    );
    const due = await this.repository.findDue(cutoff, periodStart);
    const result = { scanned: due.length, created: 0, skipped: 0, failed: 0 };

    for (const routine of due) {
      try {
        const exercises = routine.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          ...diagnoseExercise(exercise.sessions, now),
        }));
        const adherence = await this.adherence.execute(routine.studentId);
        const missing = [
          ...new Set(exercises.flatMap((item) => item.criteriaNotEvaluated)),
        ];
        const created = await this.repository.saveIfDue({
          studentId: routine.studentId,
          routineVersionId: routine.routineVersionId,
          periodStart,
          periodEnd: now,
          globalSituation: globalSituation(exercises),
          adherence: adherence.adherencia.disponible
            ? adherence.adherencia.porcentaje
            : null,
          criteriaNotEvaluated: missing,
          globalFindings: {
            dataOrigin: 'REAL',
            simulatedSessionsExcluded: true,
            exerciseCount: exercises.length,
          },
          exercises: exercises.map(({ exerciseId, situation, metrics }) => ({
            exerciseId,
            situation,
            metrics,
          })),
          calculatedAt: now,
          notBefore: cutoff,
        });
        if (created) result.created += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        console.error(
          'evolution-diagnostics job failed',
          routine.studentId,
          error,
        );
      }
    }
    return result;
  }
}
