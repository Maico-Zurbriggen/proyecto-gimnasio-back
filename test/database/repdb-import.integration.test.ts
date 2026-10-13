import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '../../src/modules/exercise-catalog/infrastructure/import/repdb-package';

const url = process.env.CATALOG_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== '127.0.0.1' ||
    target.port !== '55434' ||
    target.pathname !== '/gym_catalog_test'
  )
    throw new Error('Importer tests require the isolated database');
}
const database = new PrismaClient({
  datasourceUrl: url ?? 'postgresql://unused@127.0.0.1:1/unused',
});
const run = promisify(execFile);
const prefix = randomUUID().slice(0, 8);
let privateRoot: string;
const entry = (id: string) => ({
  id,
  name_es: `Synthetic ${id}`,
  description_es: 'Synthetic import fixture, not provider data.',
  instructions_es: ['Synthetic instructions for automated testing.'],
  tips_es: [],
  difficulty: 'beginner',
  equipment: null,
  primary_muscles: ['Test muscle'],
  secondary_muscles: [],
  is_unilateral: false,
  images: { flat: { main: `images/flat/${id}.webp` } },
});
async function stage(
  entries: ReturnType<typeof entry>[],
  invalidTaxonomy = false,
  omitLastImage = false,
) {
  const json = JSON.stringify({
    schema_version: 1,
    license: 'synthetic test fixture',
    count: entries.length,
    exercises: entries,
  });
  const revision = sha256(json);
  const folder = join(privateRoot, 'staged', revision);
  const assets = join(privateRoot, 'assets', revision);
  await mkdir(folder, { recursive: true });
  await mkdir(assets, { recursive: true });
  await writeFile(join(folder, 'exercises.json'), json);
  for (const item of entries.slice(0, omitLastImage ? -1 : undefined))
    await writeFile(
      join(assets, basename(item.images.flat.main)),
      Buffer.from('RIFF0000WEBPsynthetic'),
    );
  const reviewPath = join(folder, 'review.json');
  await writeFile(
    reviewPath,
    JSON.stringify({
      sourceRevision: revision,
      entries: entries.map((item, index) => ({
        sourceId: item.id,
        reviewed: true,
        reviewer: 'Synthetic test reviewer',
        reviewedAt: '2026-10-06T00:00:00Z',
        movementPattern: 'CORE',
        difficultyLevel: 'PRINCIPIANTE',
        equipment: [
          invalidTaxonomy && index === entries.length - 1
            ? 'MISSING_TAXONOMY'
            : 'PESO_CORPORAL',
        ],
        primaryMuscles: [`IMPORT_M_${prefix}`],
        secondaryMuscles: [],
        joints: [`IMPORT_J_${prefix}`],
      })),
    }),
  );
  return { reviewPath, folder };
}
async function publish(reviewPath: string) {
  const result = await run(
    process.execPath,
    [
      '--require',
      './scripts/tsx-windows-userinfo-compat.cjs',
      './node_modules/tsx/dist/cli.mjs',
      'scripts/import-repdb.ts',
      'publish',
      reviewPath,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: url,
        CATALOG_PRIVATE_DIR: privateRoot,
        CATALOG_ASSETS_DIR: join(privateRoot, 'assets'),
        CATALOG_MEDIA_BASE_URL: '/catalog/media',
      },
      timeout: 30000,
    },
  );
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!);
}

describe.skipIf(!url)('RepDB publisher against isolated PostgreSQL', () => {
  beforeAll(async () => {
    privateRoot = await mkdtemp(join(tmpdir(), 'gym-catalog-import-'));
    await database.equipment.upsert({
      where: { code: 'PESO_CORPORAL' },
      update: {},
      create: { code: 'PESO_CORPORAL', name: 'Peso corporal', displayOrder: 1 },
    });
    const muscle = await database.muscleGroup.aggregate({
      _max: { displayOrder: true },
    });
    const joint = await database.joint.aggregate({
      _max: { displayOrder: true },
    });
    await database.muscleGroup.create({
      data: {
        code: `IMPORT_M_${prefix}`,
        name: `Synthetic import muscle ${prefix}`,
        region: 'CORE',
        displayOrder: (muscle._max.displayOrder ?? 0) + 1,
      },
    });
    await database.joint.create({
      data: {
        code: `IMPORT_J_${prefix}`,
        name: `Synthetic import joint ${prefix}`,
        region: 'CORE',
        displayOrder: (joint._max.displayOrder ?? 0) + 1,
      },
    });
  });
  afterAll(async () => {
    await database.$disconnect();
    if (
      privateRoot &&
      resolve(privateRoot).startsWith(`${resolve(tmpdir())}${sep}`) &&
      basename(privateRoot).startsWith('gym-catalog-import-')
    )
      await rm(privateRoot, { recursive: true, force: true });
  });

  it('keeps stable UUIDs, skips unchanged entries and never enables or reactivates imports', async () => {
    const entries = [entry(`a-${prefix}`), entry(`b-${prefix}`)];
    const first = await stage(entries);
    expect(await publish(first.reviewPath)).toMatchObject({
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    const original = await database.exercise.findMany({
      where: {
        source: 'RepDB',
        sourceId: { in: entries.map((item) => item.id) },
      },
      orderBy: { sourceId: 'asc' },
    });
    expect(await publish(first.reviewPath)).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    await database.exercise.update({
      where: { id: original[0]!.id },
      data: { state: 'DESACTIVADO' },
    });
    entries[0]!.name_es = 'Synthetic renamed exercise';
    const changed = await stage(entries);
    expect(await publish(changed.reviewPath)).toMatchObject({
      created: 0,
      updated: 1,
      unchanged: 1,
    });
    const current = await database.exercise.findMany({
      where: { id: { in: original.map((item) => item.id) } },
      orderBy: { sourceId: 'asc' },
    });
    expect(current.map((item) => item.id)).toEqual(
      original.map((item) => item.id),
    );
    expect(current.map((item) => item.revision)).toEqual([2, 1]);
    expect(current[0]!.state).toBe('DESACTIVADO');
    expect(
      await database.gymExercise.count({
        where: { exerciseId: { in: original.map((item) => item.id) } },
      }),
    ).toBe(0);
    expect(
      JSON.parse(
        await readFile(
          join(changed.folder, 'last-publish-report.json'),
          'utf8',
        ),
      ),
    ).toMatchObject({ updated: 1, unchanged: 1 });
  }, 30000);

  it('rolls back the entire batch when a later taxonomy is invalid', async () => {
    const entries = [entry(`c-${prefix}`), entry(`d-${prefix}`)];
    const staged = await stage(entries, true);
    await expect(publish(staged.reviewPath)).rejects.toThrow();
    expect(
      await database.exercise.count({
        where: {
          source: 'RepDB',
          sourceId: { in: entries.map((item) => item.id) },
        },
      }),
    ).toBe(0);
  }, 30000);

  it('rolls back the entire batch when a reviewed image is missing', async () => {
    const entries = [entry(`e-${prefix}`), entry(`f-${prefix}`)];
    const staged = await stage(entries, false, true);
    await expect(publish(staged.reviewPath)).rejects.toThrow();
    expect(
      await database.exercise.count({
        where: {
          source: 'RepDB',
          sourceId: { in: entries.map((item) => item.id) },
        },
      }),
    ).toBe(0);
  }, 30000);
});
