import { z } from 'zod';

import {
  MOVEMENT_PATTERNS,
  TRAINING_PURPOSES,
} from '../../modules/routine-generations/domain/services/generated-routine-validator';

const setSchema = z.strictObject({
  position: z.number().int().positive(),
  min_repetitions: z.number().int().positive(),
  max_repetitions: z.number().int().positive(),
  suggested_load: z.number().nonnegative().nullable(),
  rest_seconds: z.number().int().nonnegative(),
  warmup: z.boolean(),
});

const outputSchema = z.strictObject({
  schema_version: z.literal('1.0'),
  routine_type: z.enum(TRAINING_PURPOSES),
  target_weekly_frequency: z.number().int().min(1).max(7),
  days: z
    .array(
      z.strictObject({
        position: z.number().int().positive(),
        name: z.string().min(1).max(120),
        dominant_pattern: z.enum(MOVEMENT_PATTERNS),
        exercises: z
          .array(
            z.strictObject({
              position: z.number().int().positive(),
              exercise_id: z.uuid(),
              note: z.string().max(500).nullable(),
              sets: z.array(setSchema).min(1),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(7),
  uncovered_patterns: z.array(z.string()),
  explanation: z.string().min(1).max(2000),
});

/** Translate the versioned AI contract before applying backend domain rules. */
export function adaptRoutineGenerationOutput(output: unknown): unknown {
  if (
    typeof output === 'object' &&
    output !== null &&
    !('schema_version' in output) &&
    'tipo_rutina' in output
  ) {
    return output;
  }
  const parsed = outputSchema.safeParse(output);
  if (!parsed.success) return null;
  const routine = parsed.data;
  return {
    tipo_rutina: routine.routine_type,
    frecuencia_semanal: routine.target_weekly_frequency,
    dias: routine.days.map((day) => ({
      orden: day.position,
      nombre: day.name,
      ejercicios: day.exercises.map((exercise) => ({
        orden: exercise.position,
        ejercicio_id: exercise.exercise_id,
        nota: exercise.note,
        series: exercise.sets.map((set) => ({
          orden: set.position,
          repeticiones_min: set.min_repetitions,
          repeticiones_max: set.max_repetitions,
          carga_sugerida: set.suggested_load,
          descanso_segundos: set.rest_seconds,
          es_calentamiento: set.warmup,
        })),
      })),
    })),
  };
}
