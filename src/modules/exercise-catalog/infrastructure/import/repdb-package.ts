import { createHash } from 'node:crypto';
import { z } from 'zod';
import { unzipSync } from 'fflate';
import { LEVELS, PATTERNS } from '../../domain/catalog';

const text = z.string().trim().min(1);
const lines = z.array(text).max(100);
const slug = z.string().regex(/^[a-z0-9-]+$/);
const imagePath = z.string().regex(/^images\/flat\/[a-z0-9-]+\.webp$/);
const exercise = z.object({
  id: slug,
  name_es: text.max(160),
  description_es: text.max(1000),
  instructions_es: lines.min(1),
  tips_es: lines.default([]),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
  equipment: z.string().nullable().optional(),
  primary_muscles: lines.min(1),
  secondary_muscles: lines.nullable().optional(),
  is_unilateral: z.boolean(),
  images: z.object({
    flat: z.object({
      start: imagePath.optional(),
      peak: imagePath.optional(),
      main: imagePath.optional(),
    }),
  }),
});
const packageSchema = z.object({
  schema_version: z.union([z.string(), z.number().int().positive()]),
  license: z.string(),
  count: z.number().int().positive(),
  exercises: z.array(exercise).min(1).max(10000),
});
export type RepdbExercise = z.infer<typeof exercise>;
export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}
export function parseRepdbPackage(bytes: Uint8Array) {
  const data = packageSchema.parse(
    JSON.parse(Buffer.from(bytes).toString('utf8')),
  );
  if (
    data.count !== data.exercises.length ||
    new Set(data.exercises.map((item) => item.id)).size !== data.count
  )
    throw new Error('Invalid count or repeated source identity');
  for (const item of data.exercises) {
    if (
      !Object.values(item.images.flat).length ||
      item.instructions_es.join('\n').length > 12000
    )
      throw new Error(`Incomplete exercise ${item.id}`);
    if (
      new Set(item.primary_muscles).size !== item.primary_muscles.length ||
      new Set(item.secondary_muscles ?? []).size !==
        (item.secondary_muscles ?? []).length
    )
      throw new Error(`Repeated muscles ${item.id}`);
  }
  return data;
}

export function extractRepdbImages(
  zip: Uint8Array,
  entries: RepdbExercise[],
  allowMissing = false,
): Record<string, Uint8Array> {
  const required = new Set(
    entries.flatMap((item) =>
      Object.values(item.images.flat).filter((path): path is string => !!path),
    ),
  );
  const seen = new Set<string>();
  let total = 0;
  const images = unzipSync(zip, {
    filter: (file) => {
      if (
        file.name.includes('..') ||
        file.name.startsWith('/') ||
        file.name.includes('\\')
      )
        throw new Error('Unsafe ZIP path');
      if (seen.has(file.name)) throw new Error('Repeated ZIP path');
      seen.add(file.name);
      if (!required.has(file.name)) return false;
      total += file.originalSize;
      if (file.originalSize > 2_000_000 || total > 250_000_000)
        throw new Error('ZIP exceeds image capacity');
      return true;
    },
  });
  for (const path of required) {
    const bytes = images[path];
    if (!bytes && allowMissing) continue;
    if (
      !bytes ||
      Buffer.from(bytes.subarray(0, 4)).toString() !== 'RIFF' ||
      Buffer.from(bytes.subarray(8, 12)).toString() !== 'WEBP'
    )
      throw new Error(`Missing or invalid image ${path}`);
  }
  return images;
}

export const repdbReviewSchema = z.strictObject({
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  entries: z
    .array(
      z.strictObject({
        sourceId: slug,
        reviewed: z.boolean(),
        reviewer: z.string().max(160),
        reviewedAt: z.iso.datetime().nullable(),
        movementPattern: z.enum(PATTERNS).nullable(),
        difficultyLevel: z.enum(LEVELS).nullable(),
        equipment: lines.nullable(),
        primaryMuscles: lines.nullable(),
        secondaryMuscles: lines.nullable(),
        joints: lines.nullable(),
      }),
    )
    .max(10000),
});
export type RepdbReview = z.infer<typeof repdbReviewSchema>;
export function validateReviewedEntries(
  review: RepdbReview,
  sourceRevision: string,
  source: RepdbExercise[],
) {
  if (
    review.sourceRevision !== sourceRevision ||
    new Set(review.entries.map((item) => item.sourceId)).size !==
      review.entries.length
  )
    throw new Error('Review revision mismatch or repeated identity');
  const ids = new Set(source.map((item) => item.id));
  for (const item of review.entries) {
    if (!ids.has(item.sourceId))
      throw new Error(`Unknown source identity ${item.sourceId}`);
    if (!item.reviewed) continue;
    if (
      !item.reviewer.trim() ||
      !item.reviewedAt ||
      !item.movementPattern ||
      !item.difficultyLevel ||
      !item.equipment?.length ||
      !item.primaryMuscles?.length ||
      !item.joints?.length ||
      item.secondaryMuscles === null
    )
      throw new Error(`Incomplete review ${item.sourceId}`);
    const unique = (list: string[]) => new Set(list).size === list.length;
    if (
      ![
        item.equipment,
        item.primaryMuscles,
        item.secondaryMuscles,
        item.joints,
      ].every(unique) ||
      item.primaryMuscles.some((code) => item.secondaryMuscles!.includes(code))
    )
      throw new Error(`Invalid reviewed taxonomy ${item.sourceId}`);
  }
  return review.entries.filter((item) => item.reviewed);
}
