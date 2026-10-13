import 'dotenv/config';
import { mkdir, readFile, writeFile, rename, access } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  extractRepdbImages,
  parseRepdbPackage,
  repdbReviewSchema,
  sha256,
  validateReviewedEntries,
} from '../src/modules/exercise-catalog/infrastructure/import/repdb-package';

const JSON_URL =
  'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json';
const ZIP_URL = 'https://cdn.repdb.co/repdb-assets/site/repdb-free.zip';
const LICENSE_URL =
  'https://raw.githubusercontent.com/RepDB/exercise-dataset/main/LICENSE-DATA.md';
const root = resolve(process.env.CATALOG_PRIVATE_DIR ?? '.catalog-private');
const assetsRoot = resolve(
  process.env.CATALOG_ASSETS_DIR ?? resolve(root, 'assets'),
);
async function download(url: string, maxBytes: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(120000),
    redirect: 'error',
  });
  if (!response.ok || !response.body)
    throw new Error(`Download failed: ${response.status}`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > maxBytes) throw new Error('Download exceeds capacity');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function stage() {
  const [json, zip, license] = await Promise.all([
    download(JSON_URL, 20_000_000),
    download(ZIP_URL, 100_000_000),
    download(LICENSE_URL, 100_000),
  ]);
  const source = parseRepdbPackage(json);
  const images = extractRepdbImages(zip, source.exercises, true);
  const incomplete = source.exercises
    .filter((item) =>
      Object.values(item.images.flat).some((path) => path && !images[path]),
    )
    .map((item) => item.id);
  const revision = sha256(json);
  const stageRoot = resolve(root, 'staged', revision);
  const assetDirectory = resolve(assetsRoot, revision);
  await mkdir(stageRoot, { recursive: true });
  await mkdir(assetDirectory, { recursive: true });
  // Only flat images actually referenced by the public package; no premium samples.
  for (const [path, bytes] of Object.entries(images))
    await writeFile(resolve(assetDirectory, basename(path)), bytes);
  await writeFile(resolve(stageRoot, 'exercises.json'), json);
  await writeFile(resolve(stageRoot, 'LICENSE-DATA.md'), license);
  await writeFile(
    resolve(stageRoot, 'missing-media.json'),
    JSON.stringify(
      {
        incompleteExerciseIds: incomplete,
        missingPaths: [
          ...new Set(
            source.exercises.flatMap((item) =>
              Object.values(item.images.flat).filter(
                (path) => path && !images[path],
              ),
            ),
          ),
        ],
      },
      null,
      2,
    ),
  );
  await writeFile(
    resolve(stageRoot, 'provenance.json'),
    JSON.stringify(
      {
        source: 'RepDB',
        sourceUrl: JSON_URL,
        zipUrl: ZIP_URL,
        licenseUrl: LICENSE_URL,
        sourceRevision: revision,
        zipHash: sha256(zip),
        licenseHash: sha256(license),
        fetchedAt: new Date().toISOString(),
        schemaVersion: source.schema_version,
        count: source.count,
      },
      null,
      2,
    ),
  );
  const reviewPath = resolve(stageRoot, 'review.json');
  try {
    await access(reviewPath);
  } catch {
    await writeFile(
      reviewPath,
      JSON.stringify(
        {
          sourceRevision: revision,
          entries: source.exercises.map((item) => ({
            sourceId: item.id,
            reviewed: false,
            reviewer: '',
            reviewedAt: null,
            movementPattern: null,
            difficultyLevel: {
              beginner: 'PRINCIPIANTE',
              intermediate: 'INTERMEDIO',
              advanced: 'AVANZADO',
            }[item.difficulty],
            equipment: null,
            primaryMuscles: null,
            secondaryMuscles: null,
            joints: null,
          })),
        },
        null,
        2,
      ),
    );
  }
  console.log(
    JSON.stringify({
      action: 'staged',
      count: source.count,
      imageCount: Object.keys(images).length,
      incompleteExerciseCount: incomplete.length,
      sourceRevision: revision,
      reviewPath,
    }),
  );
}

async function publish(reviewPath: string | undefined) {
  if (!reviewPath)
    throw new Error('Usage: catalog:import publish <private review.json>');
  const review = repdbReviewSchema.parse(
    JSON.parse(await readFile(resolve(reviewPath), 'utf8')),
  );
  const stageRoot = resolve(root, 'staged', review.sourceRevision);
  const json = await readFile(resolve(stageRoot, 'exercises.json'));
  const source = parseRepdbPackage(json);
  const reviewed = validateReviewedEntries(
    review,
    sha256(json),
    source.exercises,
  );
  if (!reviewed.length) throw new Error('No reviewed entries to publish');
  const mediaBase =
    process.env.CATALOG_MEDIA_BASE_URL?.replace(/\/$/, '') ?? '/catalog/media';
  if (mediaBase !== '/catalog/media' && !mediaBase.startsWith('https://'))
    throw new Error('Media base must use HTTPS');
  const database = new PrismaClient();
  try {
    const result = await database.$transaction(
      async (tx) => {
        // Lock imports of the same provider and each updated exercise. Gym choices remain untouched.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('RepDB catalog import'))::text`;
        let created = 0;
        let updated = 0;
        let unchanged = 0;
        for (const reviewedItem of [...reviewed].sort((a, b) =>
          a.sourceId.localeCompare(b.sourceId),
        )) {
          const item = source.exercises.find(
            (item) => item.id === reviewedItem.sourceId,
          )!;
          const equipment = reviewedItem.equipment!;
          const primary = reviewedItem.primaryMuscles!;
          const secondary = reviewedItem.secondaryMuscles!;
          const joints = reviewedItem.joints!;
          const [equipmentCount, muscleCount, jointCount] = await Promise.all([
            tx.equipment.count({ where: { code: { in: equipment } } }),
            tx.muscleGroup.count({
              where: { code: { in: [...primary, ...secondary] } },
            }),
            tx.joint.count({ where: { code: { in: joints } } }),
          ]);
          if (
            equipmentCount !== equipment.length ||
            muscleCount !== primary.length + secondary.length ||
            jointCount !== joints.length
          )
            throw new Error(
              `Unmapped taxonomy ${item.id}; entire import rolled back`,
            );
          const media = (['start', 'peak', 'main'] as const)
            .flatMap((pose) =>
              item.images.flat[pose]
                ? [
                    {
                      pose:
                        pose === 'start'
                          ? ('INICIO' as const)
                          : pose === 'peak'
                            ? ('FINAL' as const)
                            : ('PRINCIPAL' as const),
                      url: `${mediaBase}/${review.sourceRevision}/${basename(item.images.flat[pose]!)}`,
                    },
                  ]
                : [],
            )
            .map((item, index) => ({ ...item, position: index + 1 }));
          for (const path of Object.values(item.images.flat))
            if (path)
              await access(
                resolve(assetsRoot, review.sourceRevision, basename(path)),
              );
          const existing = await tx.exercise.findUnique({
            where: { source_sourceId: { source: 'RepDB', sourceId: item.id } },
          });
          const classificationHash = sha256(
            JSON.stringify({
              ...reviewedItem,
              reviewer: undefined,
              reviewedAt: undefined,
            }),
          );
          const materialRevision = sha256(
            JSON.stringify({ item, classificationHash }),
          );
          if (existing?.sourceRevision === materialRevision) {
            unchanged++;
            continue;
          }
          const fields = {
            name: item.name_es,
            description: item.description_es,
            instructions: item.instructions_es
              .map((line, index) => `${index + 1}. ${line}`)
              .join('\n'),
            tips: item.tips_es,
            movementPattern: reviewedItem.movementPattern!,
            difficultyLevel: reviewedItem.difficultyLevel!,
            unilateral: item.is_unilateral,
            visualResourceUrl: media[0]!.url,
            sourceRevision: materialRevision,
            reviewedAt: new Date(reviewedItem.reviewedAt!),
            reviewObservation: `Importación revisada por ${reviewedItem.reviewer}`,
          };
          const relations = {
            equipment: {
              create: equipment.map((equipmentCode) => ({ equipmentCode })),
            },
            muscles: {
              create: [
                ...primary.map((muscleCode) => ({
                  muscleCode,
                  participation: 'PRIMARIA' as const,
                })),
                ...secondary.map((muscleCode) => ({
                  muscleCode,
                  participation: 'SECUNDARIA' as const,
                })),
              ],
            },
            joints: { create: joints.map((jointCode) => ({ jointCode })) },
            media: { create: media },
          };
          if (existing) {
            await tx.exercise.update({
              where: { id: existing.id },
              data: {
                ...fields,
                revision: { increment: 1 },
                equipment: { deleteMany: {}, ...relations.equipment },
                muscles: { deleteMany: {}, ...relations.muscles },
                joints: { deleteMany: {}, ...relations.joints },
                media: { deleteMany: {}, ...relations.media },
              },
            });
            updated++;
          } else {
            await tx.exercise.create({
              data: {
                ...fields,
                ...relations,
                origin: 'CATALOGO_BASE',
                state: 'APROBADO',
                source: 'RepDB',
                sourceId: item.id,
              },
            });
            created++;
          }
        }
        const absent = await tx.exercise.count({
          where: {
            source: 'RepDB',
            sourceId: { notIn: source.exercises.map((item) => item.id) },
          },
        });
        return {
          created,
          updated,
          unchanged,
          absentFromSource: absent,
          pendingReview: source.count - reviewed.length,
        };
      },
      { timeout: 120000 },
    );
    const reportPath = resolve(stageRoot, 'last-publish-report.json');
    const temporary = `${reportPath}.tmp`;
    await writeFile(
      temporary,
      JSON.stringify(
        { ...result, publishedAt: new Date().toISOString() },
        null,
        2,
      ),
    );
    await rename(temporary, reportPath);
    console.log(JSON.stringify(result));
  } finally {
    await database.$disconnect();
  }
}

const [command, reviewPath] = process.argv.slice(2);
void (
  command === 'download'
    ? stage()
    : command === 'publish'
      ? publish(reviewPath)
      : Promise.reject(
          new Error('Usage: catalog:import download | publish <review.json>'),
        )
).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Import failed');
  process.exitCode = 1;
});
