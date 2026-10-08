require('dotenv').config();
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve, basename } = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { catalog } = require('./local-exercise-catalog.cjs');

const LEGACY_URLS = new Set([
  'https://www.acefitness.org/resources/everyone/exercise-library/',
  'https://www.acefitness.org/certifiednewsarticle/3008/ace-study-identifies-best-triceps-exercises/',
]);
const GYM = '10000000-0000-4000-8000-000000000001';
// Four seed-test exercises predate the hash-based fixtures; keep their IDs/history.
const fixtureIds = [
  ...catalog.map((entry) => entry.id),
  'e0000000-0015-4000-8000-000000000015',
  'e0000000-0016-4000-8000-000000000016',
  'e0000000-0017-4000-8000-000000000017',
  'e0000000-0018-4000-8000-000000000018',
];

function assertLocalDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !url.port ||
    url.port !== (process.env.LOCAL_DATABASE_PORT ?? '55432') ||
    url.pathname !== '/gym_local'
  )
    throw new Error('This fixture only supports the local gym_local database');
}

function prepareMedia(manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (
    !/^[a-f0-9]{64}$/.test(manifest.sourceRevision) ||
    !Array.isArray(manifest.entries)
  )
    throw new Error('Invalid local media manifest');
  const root = resolve(process.env.CATALOG_PRIVATE_DIR ?? '.catalog-private');
  const bytes = readFileSync(
    resolve(root, 'staged', manifest.sourceRevision, 'exercises.json'),
  );
  if (
    createHash('sha256').update(bytes).digest('hex') !== manifest.sourceRevision
  )
    throw new Error('Source revision mismatch');
  const source = new Map(
    JSON.parse(bytes).exercises.map((entry) => [entry.id, entry]),
  );
  const fixtures = new Set(fixtureIds);
  const seen = new Set();
  const entries = new Map();
  for (const entry of manifest.entries) {
    if (
      !fixtures.has(entry.exerciseId) ||
      seen.has(entry.exerciseId) ||
      entry.reviewed !== true
    )
      throw new Error('Unknown, duplicate or unreviewed fixture mapping');
    seen.add(entry.exerciseId);
    const exercise = source.get(entry.sourceId);
    if (!exercise) throw new Error('Unknown source exercise');
    const media = [];
    for (const [pose, path] of Object.entries(exercise.images.flat)) {
      if (
        !/^images\/flat\/[a-z0-9-]+\.webp$/.test(path) ||
        !['start', 'peak', 'main'].includes(pose)
      )
        throw new Error('Invalid source image path');
      const assetRoot = resolve(
        process.env.CATALOG_ASSETS_DIR ?? resolve(root, 'assets'),
      );
      const image = readFileSync(
        resolve(assetRoot, manifest.sourceRevision, basename(path)),
      );
      if (
        image.length > 2_000_000 ||
        image.toString('ascii', 0, 4) !== 'RIFF' ||
        image.toString('ascii', 8, 12) !== 'WEBP'
      )
        throw new Error('Missing or invalid WebP image');
      media.push({
        position: media.length + 1,
        pose: { start: 'INICIO', peak: 'FINAL', main: 'PRINCIPAL' }[pose],
        url: `/catalog/media/${manifest.sourceRevision}/${basename(path)}`,
      });
    }
    if (!media.length) throw new Error('Source exercise has no image');
    entries.set(entry.exerciseId, media);
  }
  return entries;
}

async function main() {
  assertLocalDatabase();
  const args = process.argv.slice(2);
  if (args.length !== 1)
    throw new Error('Provide one private, reviewed local media manifest');
  // Validate every mapping and every file before opening a database connection.
  const mediaById = prepareMedia(args[0]);
  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM app.gyms WHERE id = ${GYM}::uuid FOR UPDATE`;
        const rows = await tx.exercise.findMany({
          where: {
            gymId: GYM,
            origin: 'GIMNASIO',
            id: { in: fixtureIds },
          },
          include: { media: { orderBy: { position: 'asc' } } },
        });
        let updated = 0;
        let illustrated = 0;
        for (const row of rows) {
          if (row.state !== 'APROBADO') continue;
          // Never replace trainer uploads, other catalogues or another gym's data.
          if (
            row.visualResourceUrl &&
            !LEGACY_URLS.has(row.visualResourceUrl) &&
            !row.visualResourceUrl.startsWith('/catalog/media/')
          )
            continue;
          if (row.media.some((item) => !item.url.startsWith('/catalog/media/')))
            continue;
          const media = mediaById.get(row.id) ?? [];
          if (media.length) illustrated++;
          const current = row.media.map(({ position, pose, url }) => ({
            position,
            pose,
            url,
          }));
          if (
            row.visualResourceUrl === (media[0]?.url ?? '') &&
            JSON.stringify(current) === JSON.stringify(media)
          )
            continue;
          await tx.exercise.update({
            where: { id: row.id },
            data: {
              visualResourceUrl: media[0]?.url ?? '',
              revision: { increment: 1 },
              media: { deleteMany: {}, create: media },
            },
          });
          updated++;
        }
        return {
          fixtures: rows.length,
          updated,
          illustrated,
          withoutImage: rows.length - illustrated,
        };
      },
      { timeout: 30000 },
    );
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
