import { AdjustmentNotApplicableError } from '../errors/proposal-errors';

export type AdjustmentType =
  'CARGA' | 'VOLUMEN' | 'ESQUEMA' | 'SUSTITUCION' | 'ESTRUCTURA';

export interface PrescribedSetPlan {
  position: number;
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number;
  restSeconds: number;
  warmup: boolean;
}

export interface RoutineExercisePlan {
  /** Id del ejercicio de rutina en la versión de origen; los ajustes lo referencian. */
  sourceId: string;
  exerciseId: string;
  position: number;
  note: string | null;
  compatibilityState: string;
  compatibilityReason: string | null;
  sets: PrescribedSetPlan[];
}

export interface RoutineDayPlan {
  position: number;
  name: string;
  dominantPattern: string;
  exercises: RoutineExercisePlan[];
}

export interface AdjustmentToApply {
  id: string;
  type: AdjustmentType;
  routineExerciseId: string | null;
  proposedValue: unknown;
}

const MAX_LOAD = 1000;

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function isInteger(value: unknown, min: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min;
}

function renumber(sets: PrescribedSetPlan[]): PrescribedSetPlan[] {
  return sets.map((set, index) => ({ ...set, position: index + 1 }));
}

function applyToExercise(
  exercise: RoutineExercisePlan,
  adjustment: AdjustmentToApply,
): void {
  const fail = (reason: string) => {
    throw new AdjustmentNotApplicableError(adjustment.id, reason);
  };
  const value = adjustment.proposedValue;

  switch (adjustment.type) {
    case 'CARGA': {
      const load = field(value, 'carga_sugerida');
      if (typeof load !== 'number' || load < 0 || load > MAX_LOAD) {
        fail('carga_sugerida must be a number between 0 and 1000');
      }
      for (const set of exercise.sets) {
        if (!set.warmup) set.suggestedLoad = load as number;
      }
      return;
    }
    case 'ESQUEMA': {
      const min = field(value, 'min_repetitions');
      const max = field(value, 'max_repetitions');
      if (!isInteger(min, 1) || !isInteger(max, min as number)) {
        fail('min_repetitions/max_repetitions must be a valid range');
      }
      for (const set of exercise.sets) {
        if (!set.warmup) {
          set.minRepetitions = min as number;
          set.maxRepetitions = max as number;
        }
      }
      return;
    }
    case 'VOLUMEN': {
      const target = field(value, 'series_trabajo');
      if (!isInteger(target, 1)) {
        fail('series_trabajo must be a positive integer');
      }
      const warmups = exercise.sets.filter((set) => set.warmup);
      const working = exercise.sets.filter((set) => !set.warmup);
      const template = working.at(-1);
      if (!template) {
        fail('exercise has no working sets to replicate');
      }
      while (working.length < (target as number)) {
        working.push({ ...(template as PrescribedSetPlan) });
      }
      working.length = target as number;
      exercise.sets = renumber([...warmups, ...working]);
      return;
    }
    case 'SUSTITUCION': {
      const exerciseId = field(value, 'exercise_id');
      if (typeof exerciseId !== 'string' || exerciseId.length === 0) {
        fail('exercise_id is required for a substitution');
      }
      exercise.exerciseId = exerciseId as string;
      return;
    }
    case 'ESTRUCTURA':
      fail('structure adjustments must be applied manually by the trainer');
  }
}

/**
 * Construye los días de la versión nueva aplicando los ajustes aceptados (RN-88).
 *
 * Trabaja sobre una copia: la versión de origen queda íntegra. Formatos admitidos
 * de `proposedValue`: `CARGA {carga_sugerida}`, `ESQUEMA {min_repetitions,
 * max_repetitions}`, `VOLUMEN {series_trabajo}` y `SUSTITUCION {exercise_id}`. Las
 * series de calentamiento no se modifican. `ESTRUCTURA` no se aplica automáticamente.
 */
export function applyAdjustments(
  days: readonly RoutineDayPlan[],
  adjustments: readonly AdjustmentToApply[],
): RoutineDayPlan[] {
  const copy: RoutineDayPlan[] = structuredClone([...days]);
  const exercisesBySource = new Map(
    copy.flatMap((day) =>
      day.exercises.map((exercise) => [exercise.sourceId, exercise] as const),
    ),
  );

  for (const adjustment of adjustments) {
    const exercise = adjustment.routineExerciseId
      ? exercisesBySource.get(adjustment.routineExerciseId)
      : undefined;
    if (!exercise) {
      throw new AdjustmentNotApplicableError(
        adjustment.id,
        'routine exercise is not part of the current version',
      );
    }
    applyToExercise(exercise, adjustment);
  }

  return copy;
}
