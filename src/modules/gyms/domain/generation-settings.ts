/** Explicit gym policy; absent policy leaves prescription decisions to AI and trainer. */
export interface GenerationSettings {
  minExercisesPerDay: number;
  maxExercisesPerDay: number;
  minWorkSetsPerExercise: number;
  maxWorkSetsPerExercise: number;
  minRepetitions: number;
  maxRepetitions: number;
  minRestSeconds: number;
  maxRestSeconds: number;
  warmupSetsPerExercise: number;
}

export interface GenerationSettingsSnapshot {
  settings: GenerationSettings | null;
  revision: number;
}

export class GenerationSettingsError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
  ) {
    super(code);
  }
}

export function validateGenerationSettings(settings: GenerationSettings): void {
  const intervals: Array<[number, number, number, number]> = [
    [settings.minExercisesPerDay, settings.maxExercisesPerDay, 1, 20],
    [settings.minWorkSetsPerExercise, settings.maxWorkSetsPerExercise, 1, 10],
    [settings.minRepetitions, settings.maxRepetitions, 1, 100],
    [settings.minRestSeconds, settings.maxRestSeconds, 0, 1800],
  ];
  if (
    intervals.some(
      ([min, max, lower, upper]) =>
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        min < lower ||
        max > upper ||
        min > max,
    ) ||
    !Number.isInteger(settings.warmupSetsPerExercise) ||
    settings.warmupSetsPerExercise < 0 ||
    settings.warmupSetsPerExercise > 5
  )
    throw new GenerationSettingsError('invalid_generation_settings');
  // Ensure even a seven-day routine fits the existing 500-set transport budget.
  if (
    7 *
      settings.maxExercisesPerDay *
      (settings.maxWorkSetsPerExercise + settings.warmupSetsPerExercise) >
    500
  )
    throw new GenerationSettingsError('generation_settings_exceed_capacity');
}

export function generationSettingsViolations(
  routine: {
    days: Array<{
      exercises: Array<{
        sets: Array<{
          warmup: boolean;
          minRepetitions: number;
          maxRepetitions: number;
          restSeconds: number;
        }>;
      }>;
    }>;
  },
  settings: GenerationSettings | null,
): string[] {
  if (!settings) return [];
  const errors: string[] = [];
  for (const [index, day] of routine.days.entries()) {
    if (
      day.exercises.length < settings.minExercisesPerDay ||
      day.exercises.length > settings.maxExercisesPerDay
    )
      errors.push(
        `Día ${index + 1}: cantidad de ejercicios fuera de los parámetros del gimnasio.`,
      );
    for (const exercise of day.exercises) {
      const work = exercise.sets.filter((set) => !set.warmup);
      const warmup = exercise.sets.length - work.length;
      if (
        work.length < settings.minWorkSetsPerExercise ||
        work.length > settings.maxWorkSetsPerExercise ||
        warmup !== settings.warmupSetsPerExercise
      )
        errors.push(
          `Día ${index + 1}: cantidad de series fuera de los parámetros del gimnasio.`,
        );
      if (
        exercise.sets.some(
          (set) =>
            set.minRepetitions < settings.minRepetitions ||
            set.maxRepetitions > settings.maxRepetitions ||
            set.minRepetitions > set.maxRepetitions ||
            set.restSeconds < settings.minRestSeconds ||
            set.restSeconds > settings.maxRestSeconds,
        )
      )
        errors.push(
          `Día ${index + 1}: repeticiones o descanso fuera de los parámetros del gimnasio.`,
        );
    }
  }
  return errors;
}
