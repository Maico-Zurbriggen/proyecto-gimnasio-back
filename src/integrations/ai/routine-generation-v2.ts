import { z } from 'zod';
import {
  MOVEMENT_PATTERNS,
  TRAINING_PURPOSES,
  type CatalogExerciseForValidation,
  type ValidGeneratedRoutine,
} from '../../modules/routine-generations/domain/services/generated-routine-validator';

// Bounds here express storage/transport constraints, never a training prescription.
const integer = z.number().int().min(1).max(2147483647);
const set = z
  .strictObject({
    position: integer,
    min_repetitions: integer,
    max_repetitions: integer,
    suggested_load: z.number().nonnegative().max(99999999.99).nullable(),
    rest_seconds: z.number().int().min(0).max(2147483647),
    warmup: z.boolean(),
  })
  .refine(
    (value) => value.max_repetitions >= value.min_repetitions,
    'Invalid repetition interval',
  );
const proposal = z.strictObject({
  schema_version: z.literal('2.0'),
  outcome: z.literal('PROPOSED'),
  routine_type: z.enum(TRAINING_PURPOSES),
  target_weekly_frequency: z.number().int().min(1).max(7),
  days: z
    .array(
      z.strictObject({
        position: integer,
        name: z.string().trim().min(1).max(120),
        dominant_pattern: z.enum(MOVEMENT_PATTERNS),
        exercises: z
          .array(
            z.strictObject({
              position: integer,
              exercise_id: z.uuid(),
              note: z.string().max(500).nullable(),
              sets: z.array(set).min(1).max(500),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .min(1)
    .max(7),
  explanation: z.string().min(1).max(4000),
  warnings: z.array(z.string().max(1000)).max(50),
});
export const generationV2OutputSchema = z.discriminatedUnion('outcome', [
  proposal,
  z.strictObject({
    schema_version: z.literal('2.0'),
    outcome: z.literal('UNABLE'),
    reason: z.string().min(1).max(4000),
    missing_information: z.array(z.string().max(1000)).max(50),
  }),
]);

export function validateGenerationV2(
  output: unknown,
  catalog: CatalogExerciseForValidation[],
): {
  routine: ValidGeneratedRoutine | null;
  violations: string[];
  unableReason?: string;
} {
  const parsed = generationV2OutputSchema.safeParse(output);
  if (!parsed.success)
    return {
      routine: null,
      violations: parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      ),
    };
  const value = parsed.data;
  if (value.outcome === 'UNABLE')
    return { routine: null, violations: [], unableReason: value.reason };
  const violations: string[] = [];
  const totalSets = value.days.reduce(
    (sum, day) =>
      sum +
      day.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    0,
  );
  if (totalSets > 500)
    return {
      routine: null,
      violations: ['Response exceeds total transport capacity'],
    };
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const uniquePositions = (items: { position: number }[], path: string) => {
    if (new Set(items.map((item) => item.position)).size !== items.length)
      violations.push(`${path}: duplicate positions`);
  };
  if (value.days.length !== value.target_weekly_frequency)
    violations.push('Day count differs from weekly frequency');
  uniquePositions(value.days, 'days');
  const days = value.days.map((day) => {
    uniquePositions(day.exercises, `days.${day.position}.exercises`);
    return {
      position: day.position,
      name: day.name,
      dominantPattern: day.dominant_pattern,
      exercises: day.exercises.map((exercise) => {
        const ref = byId.get(exercise.exercise_id);
        if (!ref)
          violations.push(
            `Exercise outside generation snapshot: ${exercise.exercise_id}`,
          );
        uniquePositions(exercise.sets, `exercise.${exercise.position}.sets`);
        return {
          position: exercise.position,
          exerciseId: exercise.exercise_id,
          note: exercise.note,
          movementPattern: (ref?.movementPattern ??
            day.dominant_pattern) as typeof day.dominant_pattern,
          sets: exercise.sets.map((item) => ({
            position: item.position,
            minRepetitions: item.min_repetitions,
            maxRepetitions: item.max_repetitions,
            suggestedLoad: item.suggested_load,
            restSeconds: item.rest_seconds,
            warmup: item.warmup,
          })),
        };
      }),
    };
  });
  return {
    violations,
    routine: violations.length
      ? null
      : {
          routineType: value.routine_type,
          targetWeeklyFrequency: value.target_weekly_frequency,
          days,
        },
  };
}
