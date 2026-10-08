import { z } from 'zod';
import {
  EXERCISE_STATES,
  LEVELS,
  MEDIA_POSES,
  PATTERNS,
} from '../../domain/catalog';

const uniqueCodes = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .refine((v) => new Set(v).size === v.length, 'No repetir códigos');
const mediaUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    if (/^\/catalog\/media\/[a-f0-9]{64}\/[a-z0-9-]+\.webp$/.test(value))
      return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }, 'Usar una URL HTTPS o conservar una ilustración del catálogo')
  .describe(
    'HTTPS image URL or an existing, authorized /catalog/media/{revision}/{filename}.webp reference.',
  );
export const exerciseInputSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().default(null),
    instructions: z.string().trim().min(10).max(12000),
    tips: z.array(z.string().trim().min(1).max(1000)).max(20).default([]),
    movementPattern: z.enum(PATTERNS),
    difficultyLevel: z.enum(LEVELS),
    unilateral: z.boolean(),
    equipment: uniqueCodes.min(1),
    primaryMuscles: uniqueCodes.min(1),
    secondaryMuscles: uniqueCodes,
    joints: uniqueCodes.min(1),
    media: z
      .array(z.strictObject({ pose: z.enum(MEDIA_POSES), url: mediaUrl }))
      .min(1)
      .max(6),
  })
  .refine(
    (v) => !v.primaryMuscles.some((code) => v.secondaryMuscles.includes(code)),
    'Un músculo no puede tener dos participaciones',
  );

export const catalogQuerySchema = z.strictObject({
  search: z.string().trim().max(160).optional(),
  muscle: z.string().max(60).optional(),
  equipment: z.string().max(60).optional(),
  pattern: z.enum(PATTERNS).optional(),
  difficulty: z.enum(LEVELS).optional(),
  state: z.enum(EXERCISE_STATES).optional(),
  origin: z.enum(['CATALOGO_BASE', 'GIMNASIO']).optional(),
  enabled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export const exerciseParamsSchema = z.object({ exerciseId: z.uuid() });
export const updateExerciseSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  exercise: exerciseInputSchema,
});
export const reviewExerciseSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  state: z.enum(['APROBADO', 'RECHAZADO', 'DESACTIVADO']),
  observation: z.string().trim().max(1000).nullable().default(null),
  enable: z.boolean().default(false),
});
export const availabilitySchema = z
  .strictObject({
    changes: z
      .array(
        z.strictObject({
          exerciseId: z.uuid(),
          enabled: z.boolean(),
          expectedRevision: z.number().int().positive().nullable(),
        }),
      )
      .min(1)
      .max(200),
  })
  .refine(
    (v) =>
      new Set(v.changes.map((i) => i.exerciseId)).size === v.changes.length,
    'No repetir ejercicios',
  );
export const inventorySchema = z.strictObject({
  equipment: uniqueCodes,
  expectedRevision: z.number().int().nonnegative(),
});
