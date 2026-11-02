import { GRUPOS_MUSCULARES } from '../../physical-conditions/domain/services/body-zones';
import {
  PESO_PARTICIPACION_PRIMARIA,
  PESO_PARTICIPACION_SECUNDARIA,
} from './volume';
import { sinDatosSuficientes } from './insufficient-data';

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
  const unclassifiedSets = exercises
    .filter((exercise) => !validClassification(exercise.muscles))
    .reduce((sum, exercise) => sum + exercise.completedWorkSets, 0);
  // Sin series clasificadas no hay volumen calculable: nunca se informa 0.
  const available = sessionCount > 0 && classifiedSets > 0;
  const insufficientData = available
    ? null
    : sessionCount === 0
      ? sinDatosSuficientes(
          'sesiones completadas en el período',
          'sesiones',
          1,
          0,
          'Elegí otro período o registrá una sesión completada.',
        )
      : sinDatosSuficientes(
          'series de trabajo completadas de ejercicios con clasificación muscular',
          'series',
          1,
          0,
          unclassifiedSets > 0
            ? 'Clasificá los ejercicios ejecutados (hay series sin clasificación muscular).'
            : 'Registrá series de trabajo completadas en el período.',
        );
  return {
    insufficientData,
    unclassifiedSets,
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
