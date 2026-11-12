import { cargaMaximaEstimada } from '../../../indicators/domain/estimated-max-load';

export type EvolutionSituation =
  | 'DATOS_INSUFICIENTES'
  | 'SOBREEXIGENCIA'
  | 'PROGRESION_ADECUADA'
  | 'ESTIMULO_INSUFICIENTE'
  | 'ESTANCAMIENTO';

export interface DiagnosticSet {
  warmup: boolean;
  completed: boolean;
  prescribedMaxRepetitions: number;
  performedRepetitions: number | null;
  performedLoad: number | null;
  perceivedEffort: number | null;
}

export interface DiagnosticSession {
  occurredOn: Date;
  sets: DiagnosticSet[];
}

export interface ExerciseDiagnosticResult {
  situation: EvolutionSituation;
  metrics: Record<string, unknown>;
  criteriaNotEvaluated: string[];
}

const THREE_WEEKS_MS = 21 * 24 * 60 * 60 * 1000;

function estimatedMax(session: DiagnosticSession): number | null {
  return cargaMaximaEstimada(
    session.sets.map((set) => ({
      warmup: set.warmup,
      completed: set.completed,
      performedLoad: set.performedLoad,
      performedRepetitions: set.performedRepetitions,
    })),
  );
}

function repetitionCompliance(session: DiagnosticSession): number | null {
  const sets = session.sets.filter(
    (set) => !set.warmup && set.completed && set.performedRepetitions !== null,
  );
  if (sets.length === 0) return null;
  const total = sets.reduce(
    (sum, set) =>
      sum +
      Math.min(
        1,
        (set.performedRepetitions ?? 0) / set.prescribedMaxRepetitions,
      ),
    0,
  );
  return Math.round((total / sets.length) * 10_000) / 100;
}

function averageEffort(session: DiagnosticSession): number | null {
  const values = session.sets
    .filter((set) => !set.warmup && set.completed)
    .map((set) => set.perceivedEffort)
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return (
    Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10
  );
}

/** Tabla de precedencia RN-79a, aplicada por ejercicio. */
export function diagnoseExercise(
  sessions: readonly DiagnosticSession[],
  periodEnd: Date,
): ExerciseDiagnosticResult {
  const ordered = [...sessions].sort(
    (a, b) => a.occurredOn.getTime() - b.occurredOn.getTime(),
  );
  if (ordered.length < 4) {
    return {
      situation: 'DATOS_INSUFICIENTES',
      metrics: { sessionsConsidered: ordered.length, requiredSessions: 4 },
      criteriaNotEvaluated: ['variacion_carga_maxima', 'sobreexigencia'],
    };
  }

  const midpoint = new Date(periodEnd.getTime() - THREE_WEEKS_MS);
  const first = ordered
    .filter((session) => session.occurredOn < midpoint)
    .map(estimatedMax)
    .filter((value): value is number => value !== null);
  const last = ordered
    .filter((session) => session.occurredOn >= midpoint)
    .map(estimatedMax)
    .filter((value): value is number => value !== null);
  const firstMax = first.length > 0 ? Math.max(...first) : null;
  const lastMax = last.length > 0 ? Math.max(...last) : null;
  if (firstMax === null || lastMax === null || firstMax === 0) {
    return {
      situation: 'DATOS_INSUFICIENTES',
      metrics: { sessionsConsidered: ordered.length },
      criteriaNotEvaluated: ['variacion_carga_maxima'],
    };
  }

  const recentThree = ordered.slice(-3);
  const compliance = recentThree.map(repetitionCompliance);
  const efforts = recentThree.map(averageEffort);
  const overexertion =
    compliance.every((value) => value !== null && value < 70) ||
    efforts.every((value) => value !== null && value >= 9);
  const variation =
    Math.round(((lastMax - firstMax) / firstMax) * 10_000) / 100;
  const metrics = {
    sessionsConsidered: ordered.length,
    estimatedMaxVariationPercent: variation,
    recentCompliancePercent: compliance,
    recentAverageEffort: efforts,
  };
  if (overexertion)
    return { situation: 'SOBREEXIGENCIA', metrics, criteriaNotEvaluated: [] };
  if (variation >= 2.5)
    return {
      situation: 'PROGRESION_ADECUADA',
      metrics,
      criteriaNotEvaluated: [],
    };

  const recentTwo = ordered.slice(-2);
  const reachesTop = recentTwo.every((session) => {
    const workSets = session.sets.filter((set) => !set.warmup && set.completed);
    return (
      workSets.length > 0 &&
      workSets.every(
        (set) =>
          set.performedRepetitions !== null &&
          set.performedRepetitions >= set.prescribedMaxRepetitions,
      )
    );
  });
  const recentEfforts = recentTwo.map(averageEffort);
  const effortAllowsIncrease = recentEfforts.every(
    (value) => value === null || value <= 5,
  );
  const criteriaNotEvaluated = recentEfforts.some((value) => value === null)
    ? ['esfuerzo_percibido']
    : [];
  if (reachesTop && effortAllowsIncrease)
    return {
      situation: 'ESTIMULO_INSUFICIENTE',
      metrics,
      criteriaNotEvaluated,
    };
  return { situation: 'ESTANCAMIENTO', metrics, criteriaNotEvaluated };
}

export function globalSituation(
  diagnostics: readonly ExerciseDiagnosticResult[],
): EvolutionSituation {
  if (diagnostics.length === 0) return 'DATOS_INSUFICIENTES';
  const situations = new Set(diagnostics.map(({ situation }) => situation));
  if (situations.has('SOBREEXIGENCIA')) return 'SOBREEXIGENCIA';
  if (situations.has('ESTANCAMIENTO')) return 'ESTANCAMIENTO';
  if (situations.has('ESTIMULO_INSUFICIENTE')) return 'ESTIMULO_INSUFICIENTE';
  if (situations.has('PROGRESION_ADECUADA')) return 'PROGRESION_ADECUADA';
  return 'DATOS_INSUFICIENTES';
}
