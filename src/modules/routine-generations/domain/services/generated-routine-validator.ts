export const TRAINING_PURPOSES = [
  'FUERZA',
  'HIPERTROFIA',
  'RESISTENCIA_MUSCULAR',
  'ACONDICIONAMIENTO_GENERAL',
] as const;
export type TrainingPurpose = (typeof TRAINING_PURPOSES)[number];

export const MOVEMENT_PATTERNS = [
  'EMPUJE_HORIZONTAL',
  'EMPUJE_VERTICAL',
  'TRACCION_HORIZONTAL',
  'TRACCION_VERTICAL',
  'DOMINANTE_RODILLA',
  'DOMINANTE_CADERA',
  'CORE',
  'AISLAMIENTO_SUPERIOR',
  'AISLAMIENTO_INFERIOR',
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export interface GeneratedSet {
  position: number;
  minRepetitions: number;
  maxRepetitions: number;
  suggestedLoad: number;
  restSeconds: number;
  warmup: boolean;
}
export interface GeneratedExercise {
  exerciseId: string;
  position: number;
  note: string | null;
  movementPattern: MovementPattern;
  sets: GeneratedSet[];
}
export interface GeneratedDay {
  position: number;
  name: string;
  dominantPattern: MovementPattern;
  exercises: GeneratedExercise[];
}
export interface ValidGeneratedRoutine {
  routineType: TrainingPurpose;
  targetWeeklyFrequency: number;
  days: GeneratedDay[];
}
export interface CatalogExerciseForValidation {
  id: string;
  movementPattern: string;
}

interface Rule {
  frequency: readonly [number, number];
  workSets: readonly [number, number];
  repetitions: readonly [number, number];
  rest: readonly [number, number];
  exercises: readonly [number, number];
}

const RULES: Record<TrainingPurpose, Rule> = {
  FUERZA: {
    frequency: [3, 5],
    workSets: [3, 5],
    repetitions: [3, 6],
    rest: [180, 300],
    exercises: [4, 6],
  },
  HIPERTROFIA: {
    frequency: [3, 6],
    workSets: [3, 4],
    repetitions: [6, 12],
    rest: [60, 120],
    exercises: [5, 8],
  },
  RESISTENCIA_MUSCULAR: {
    frequency: [2, 4],
    workSets: [2, 4],
    repetitions: [12, 20],
    rest: [30, 60],
    exercises: [5, 8],
  },
  ACONDICIONAMIENTO_GENERAL: {
    frequency: [2, 4],
    workSets: [2, 3],
    repetitions: [8, 15],
    rest: [45, 90],
    exercises: [5, 8],
  },
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function integer(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}
function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function between(value: number, range: readonly [number, number]): boolean {
  return value >= range[0] && value <= range[1];
}
function purpose(value: unknown): TrainingPurpose | null {
  return typeof value === 'string' &&
    TRAINING_PURPOSES.includes(value as TrainingPurpose)
    ? (value as TrainingPurpose)
    : null;
}
function pattern(value: string): MovementPattern | null {
  return MOVEMENT_PATTERNS.includes(value as MovementPattern)
    ? (value as MovementPattern)
    : null;
}
function dominant(exercises: readonly GeneratedExercise[]): MovementPattern {
  const counts = new Map<MovementPattern, number>();
  for (const exercise of exercises) {
    counts.set(
      exercise.movementPattern,
      (counts.get(exercise.movementPattern) ?? 0) + 1,
    );
  }
  return exercises.reduce(
    (best, exercise) =>
      (counts.get(exercise.movementPattern) ?? 0) > (counts.get(best) ?? 0)
        ? exercise.movementPattern
        : best,
    exercises[0]!.movementPattern,
  );
}

export function validateGeneratedRoutine(
  output: unknown,
  catalog: readonly CatalogExerciseForValidation[],
): { routine: ValidGeneratedRoutine | null; violations: string[] } {
  const root = record(output);
  if (!root)
    return { routine: null, violations: ['La salida no es un objeto JSON.'] };

  const violations: string[] = [];
  const routineType = purpose(root.tipo_rutina);
  const frequency = integer(root.frecuencia_semanal);
  const rawDays = root.dias;
  if (!routineType)
    violations.push('tipo_rutina no pertenece a TrainingPurpose.');
  if (frequency === null)
    violations.push('frecuencia_semanal debe ser un entero.');
  if (!Array.isArray(rawDays) || rawDays.length < 1 || rawDays.length > 7) {
    violations.push('dias debe contener entre 1 y 7 elementos.');
  }
  if (!routineType || frequency === null || !Array.isArray(rawDays)) {
    return { routine: null, violations };
  }

  const rule = RULES[routineType];
  if (!between(frequency, rule.frequency)) {
    violations.push(`frecuencia_semanal fuera del rango de ${routineType}.`);
  }
  if (rawDays.length !== frequency) {
    violations.push(
      'La cantidad de días debe coincidir con frecuencia_semanal.',
    );
  }

  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const covered = new Set<MovementPattern>();
  const dayPositions = new Set<number>();
  const days: GeneratedDay[] = [];

  rawDays.forEach((rawDay, dayIndex) => {
    const day = record(rawDay);
    if (!day) {
      violations.push(`dias[${dayIndex}] no es un objeto.`);
      return;
    }
    const position = integer(day.orden);
    const name = typeof day.nombre === 'string' ? day.nombre.trim() : '';
    const rawExercises = day.ejercicios;
    if (position === null || position < 1 || dayPositions.has(position)) {
      violations.push(`dias[${dayIndex}].orden debe ser positivo y único.`);
    } else dayPositions.add(position);
    if (!name) violations.push(`dias[${dayIndex}].nombre es obligatorio.`);
    if (!Array.isArray(rawExercises)) {
      violations.push(`dias[${dayIndex}].ejercicios debe ser un arreglo.`);
      return;
    }
    if (!between(rawExercises.length, rule.exercises)) {
      violations.push(
        `dias[${dayIndex}] tiene una cantidad de ejercicios inválida.`,
      );
    }

    const exercisePositions = new Set<number>();
    const exercises: GeneratedExercise[] = [];
    rawExercises.forEach((rawExercise, exerciseIndex) => {
      const exercise = record(rawExercise);
      const path = `dias[${dayIndex}].ejercicios[${exerciseIndex}]`;
      if (!exercise) {
        violations.push(`${path} no es un objeto.`);
        return;
      }
      const id =
        typeof exercise.ejercicio_id === 'string' ? exercise.ejercicio_id : '';
      const catalogExercise = catalogById.get(id);
      const movementPattern = catalogExercise
        ? pattern(catalogExercise.movementPattern)
        : null;
      const exercisePosition = integer(exercise.orden);
      const rawSets = exercise.series;
      if (!catalogExercise || !movementPattern) {
        violations.push(`${path} no pertenece al catálogo prescribible.`);
      }
      if (
        exercisePosition === null ||
        exercisePosition < 1 ||
        exercisePositions.has(exercisePosition)
      ) {
        violations.push(`${path}.orden debe ser positivo y único.`);
      } else exercisePositions.add(exercisePosition);
      if (!Array.isArray(rawSets) || rawSets.length === 0) {
        violations.push(`${path}.series debe tener elementos.`);
        return;
      }

      const setPositions = new Set<number>();
      const sets: GeneratedSet[] = [];
      rawSets.forEach((rawSet, setIndex) => {
        const set = record(rawSet);
        const setPath = `${path}.series[${setIndex}]`;
        if (!set) {
          violations.push(`${setPath} no es un objeto.`);
          return;
        }
        const setPosition = integer(set.orden);
        const min = integer(set.repeticiones_min);
        const max = integer(set.repeticiones_max);
        const load = number(set.carga_sugerida);
        const rest = integer(set.descanso_segundos);
        const warmup = set.es_calentamiento;
        if (
          setPosition === null ||
          setPosition < 1 ||
          setPositions.has(setPosition)
        ) {
          violations.push(`${setPath}.orden debe ser positivo y único.`);
        } else setPositions.add(setPosition);
        if (min === null || max === null || min < 1 || max > 100 || min > max) {
          violations.push(`${setPath} tiene repeticiones inválidas.`);
        }
        if (load === null || load < 0 || load > 1000) {
          violations.push(
            `${setPath}.carga_sugerida debe estar entre 0 y 1000.`,
          );
        }
        if (rest === null || rest < 0 || rest > 600) {
          violations.push(
            `${setPath}.descanso_segundos debe estar entre 0 y 600.`,
          );
        }
        if (typeof warmup !== 'boolean')
          violations.push(`${setPath}.es_calentamiento inválido.`);
        if (
          setPosition === null ||
          min === null ||
          max === null ||
          load === null ||
          rest === null ||
          typeof warmup !== 'boolean'
        )
          return;
        if (
          !warmup &&
          (!between(min, rule.repetitions) || !between(max, rule.repetitions))
        ) {
          violations.push(
            `${setPath} no respeta las repeticiones de ${routineType}.`,
          );
        }
        if (!warmup && !between(rest, rule.rest)) {
          violations.push(
            `${setPath} no respeta el descanso de ${routineType}.`,
          );
        }
        sets.push({
          position: setPosition,
          minRepetitions: min,
          maxRepetitions: max,
          suggestedLoad: load,
          restSeconds: rest,
          warmup,
        });
      });
      if (!between(sets.filter((set) => !set.warmup).length, rule.workSets)) {
        violations.push(
          `${path} tiene una cantidad inválida de series de trabajo.`,
        );
      }
      if (catalogExercise && movementPattern && exercisePosition !== null) {
        covered.add(movementPattern);
        exercises.push({
          exerciseId: id,
          position: exercisePosition,
          note: typeof exercise.nota === 'string' ? exercise.nota : null,
          movementPattern,
          sets,
        });
      }
    });
    if (position !== null && name && exercises.length > 0) {
      days.push({
        position,
        name,
        dominantPattern: dominant(exercises),
        exercises,
      });
    }
  });

  const coverage: readonly (readonly MovementPattern[])[] = [
    ['EMPUJE_HORIZONTAL'],
    ['TRACCION_HORIZONTAL', 'TRACCION_VERTICAL'],
    ['DOMINANTE_RODILLA'],
    ['DOMINANTE_CADERA'],
  ];
  for (const alternatives of coverage) {
    if (!alternatives.some((item) => covered.has(item))) {
      violations.push(`Falta cobertura: ${alternatives.join(' o ')}.`);
    }
  }

  return {
    routine:
      violations.length === 0
        ? { routineType, targetWeeklyFrequency: frequency, days }
        : null,
    violations,
  };
}
