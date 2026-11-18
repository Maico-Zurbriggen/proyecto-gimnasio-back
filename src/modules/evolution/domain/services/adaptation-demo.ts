import {
  RULES,
  type TrainingPurpose,
} from '../../../routine-generations/domain/services/generated-routine-validator';
import type { SetSnapshot } from './adjustment-table';
import type { SesionDelDiagnostico } from './evolution-diagnosis';

export const ADAPTATION_DEMO_SCENARIOS = [
  'ESTIMULO_INSUFICIENTE',
  'SOBREEXIGENCIA',
  'ESTANCAMIENTO_PRIMERO',
  'ESTANCAMIENTO_SEGUNDO',
  'PROGRESION_ADECUADA',
  'DATOS_INSUFICIENTES',
] as const;

export type AdaptationDemoScenario = (typeof ADAPTATION_DEMO_SCENARIOS)[number];
export const ADAPTATION_DEMO_PLAN_VERSION = 2;

export class AdaptationDemoError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
    this.name = 'AdaptationDemoError';
  }
}

export interface AdaptationDemoPlan {
  sets: SetSnapshot[];
  sessions: SesionDelDiagnostico[];
  previousDiagnosisAt: Date | null;
}

interface DemoVariation {
  exerciseIndex?: number;
  dayIndex?: number;
}

/** Fixtures for the real rules, relative to the diagnosis date; no output is fabricated. */
export function buildAdaptationDemoPlan(
  scenario: AdaptationDemoScenario,
  purpose: TrainingPurpose,
  periodEnd: Date,
  { exerciseIndex = 0, dayIndex = 0 }: DemoVariation = {},
): AdaptationDemoPlan {
  const rule = RULES[purpose];
  const stagnation = scenario.startsWith('ESTANCAMIENTO');
  const minRepetitions = stagnation
    ? Math.max(
        rule.repetitions[0],
        Math.min(8 + (exerciseIndex % 2), rule.repetitions[1] - 4),
      )
    : rule.repetitions[0];
  const maxRepetitions = stagnation
    ? Math.min(minRepetitions + 2, rule.repetitions[1] - 2)
    : Math.max(
        minRepetitions,
        Math.min(12, rule.repetitions[1] - (exerciseIndex % 2)),
      );
  const setCount = rule.workSets[0] + (scenario === 'SOBREEXIGENCIA' ? 1 : 0);
  const load = ['ESTIMULO_INSUFICIENTE', 'DATOS_INSUFICIENTES'].includes(
    scenario,
  )
    ? 60 - (exerciseIndex % 5) * 7.5
    : 60 + (exerciseIndex % 8) * 5;
  const progressedLoad = load + 5 + (exerciseIndex % 3) * 2.5;
  const sets = Array.from({ length: setCount }, (_, index) => ({
    position: index + 1,
    minRepetitions,
    maxRepetitions,
    suggestedLoad: scenario === 'PROGRESION_ADECUADA' ? progressedLoad : load,
    restSeconds: Math.min(
      rule.rest[1],
      rule.rest[0] + (exerciseIndex % 3) * 15,
    ),
    warmup: false,
  }));
  const days =
    scenario === 'DATOS_INSUFICIENTES'
      ? [35, 14, 7]
      : scenario === 'ESTANCAMIENTO_SEGUNDO'
        ? [49, 35, 28, 21, 14, 7]
        : [35, 28, 14, 7];
  const ago = (count: number) =>
    new Date(periodEnd.getTime() - count * 86_400_000);
  const sessions = days.map((daysAgo, index): SesionDelDiagnostico => {
    const overexerted = scenario === 'SOBREEXIGENCIA' && index > 0;
    const phase = (index + exerciseIndex + dayIndex) % 3;
    const recent = daysAgo + dayIndex <= 21;
    const easy = scenario === 'ESTIMULO_INSUFICIENTE';
    // Integer repetitions vary without crossing the low-compliance threshold.
    const overexertedTotal = Math.floor(
      maxRepetitions * setCount * [0.55, 0.62, 0.67][phase]!,
    );
    const estimableRepetitions = Math.min(12, maxRepetitions);
    return {
      occurredOn: ago(daysAgo + dayIndex),
      series: sets.map((_, setIndex) => {
        const anchor = setIndex === 0;
        let repetitions = anchor
          ? estimableRepetitions
          : Math.max(1, estimableRepetitions - ((phase + setIndex) % 3));
        let performedLoad = Math.max(2.5, load - (anchor ? 0 : 2.5));
        let effort = Math.min(
          9,
          6 + phase + (setIndex === setCount - 1 ? 1 : 0),
        );
        if (stagnation) {
          // A slightly heavier set with one fewer repetition gives a small,
          // genuine change in e1RM. The remaining sets stay below that best set.
          repetitions = anchor
            ? estimableRepetitions - (recent ? 1 : 0)
            : minRepetitions >= 12
              ? 12 -
                (phase === 2 || (phase === 1 && setIndex === setCount - 1)
                  ? 1
                  : 0)
              : minRepetitions +
                (phase === 0
                  ? maxRepetitions - minRepetitions
                  : phase === 1
                    ? setIndex % 2
                    : 0);
          performedLoad = anchor && recent ? load + 2.5 : performedLoad;
        } else if (overexerted) {
          repetitions =
            Math.floor(overexertedTotal / setCount) +
            (setIndex < overexertedTotal % setCount ? 1 : 0);
          performedLoad += phase === 2 ? 2.5 : 0;
          effort = 9 + (setIndex < phase ? 1 : 0);
        } else if (easy) {
          repetitions = recent ? maxRepetitions : repetitions;
          if (anchor && !recent && exerciseIndex % 3 !== 0)
            performedLoad += 2.5;
          effort =
            (recent ? 3 : 5) +
            ((index + exerciseIndex + dayIndex) % 2) +
            (setIndex === setCount - 1 ? 1 : 0);
        } else if (scenario === 'PROGRESION_ADECUADA' && recent) {
          performedLoad = progressedLoad - (anchor ? 0 : 2.5);
        }
        return {
          warmup: false,
          additional: false,
          completed: true,
          prescribedMaxRepetitions: maxRepetitions,
          performedLoad,
          performedRepetitions: repetitions,
          perceivedEffort: effort,
        };
      }),
    };
  });
  return {
    sets,
    sessions,
    previousDiagnosisAt: scenario === 'ESTANCAMIENTO_SEGUNDO' ? ago(14) : null,
  };
}
