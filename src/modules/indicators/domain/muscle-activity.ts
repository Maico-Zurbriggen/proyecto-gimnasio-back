import { GRUPOS_MUSCULARES } from '../../physical-conditions/domain/services/body-zones';
import {
  PESO_PARTICIPACION_PRIMARIA,
  PESO_PARTICIPACION_SECUNDARIA,
} from './volume';

export { GRUPOS_MUSCULARES };
export type MuscleCode = (typeof GRUPOS_MUSCULARES)[number];

/** Aggregated raw work-set counts, never stored as definitive indicators. */
export interface ExerciseActivity {
  exerciseId: string | null;
  completedWorkSets: number;
  sessions: number;
  muscles: { group: string; participation: 'PRIMARIA' | 'SECUNDARIA' }[];
}

export interface MuscleAggregate {
  group: MuscleCode;
  primarySets: number;
  secondarySets: number;
  sessions: number;
}

export function presentMuscleActivity(
  sessionCount: number,
  aggregates: readonly MuscleAggregate[],
  exercises: readonly ExerciseActivity[],
) {
  const classifiedSets = exercises
    .filter((exercise) => validClassification(exercise.muscles))
    .reduce((sum, exercise) => sum + exercise.completedWorkSets, 0);
  const available =
    sessionCount > 0 && (exercises.length === 0 || classifiedSets > 0);
  return {
    unit: 'SERIES_EFECTIVAS' as const,
    groups: GRUPOS_MUSCULARES.map((group) => {
      const aggregate = aggregates.find((row) => row.group === group);
      return {
        group,
        status: available ? ('CALCULADO' as const) : ('SIN_DATOS' as const),
        volume: available
          ? Math.round(
              ((aggregate?.primarySets ?? 0) * PESO_PARTICIPACION_PRIMARIA +
                (aggregate?.secondarySets ?? 0) *
                  PESO_PARTICIPACION_SECUNDARIA) *
                10,
            ) / 10
          : null,
        frequency: available ? (aggregate?.sessions ?? 0) : null,
      };
    }),
    exerciseVolumes: exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      completedWorkSets: exercise.completedWorkSets,
      unit: 'SERIES_DE_TRABAJO' as const,
      classification: validClassification(exercise.muscles)
        ? ('CLASIFICADO' as const)
        : ('NO_CLASIFICADO' as const),
    })),
  };
}

export function validClassification(
  muscles: readonly { group: string; participation: string }[],
): boolean {
  return (
    muscles.length > 0 &&
    muscles.every(
      (muscle) =>
        (GRUPOS_MUSCULARES as readonly string[]).includes(muscle.group) &&
        ['PRIMARIA', 'SECUNDARIA'].includes(muscle.participation),
    ) &&
    muscles.filter((muscle) => muscle.participation === 'PRIMARIA').length ===
      1 &&
    new Set(muscles.map((muscle) => muscle.group)).size === muscles.length
  );
}
