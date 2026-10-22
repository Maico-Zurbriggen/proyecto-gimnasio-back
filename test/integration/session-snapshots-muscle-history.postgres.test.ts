import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaTrainingSessionsRepository } from '../../src/modules/training-sessions/infrastructure/persistence/prisma-training-sessions.repository';
import { PrismaMuscleActivityRepository } from '../../src/modules/indicators/infrastructure/prisma-muscle-activity.repository';
import {
  GRUPOS_MUSCULARES,
  presentMuscleActivity,
} from '../../src/modules/indicators/domain/muscle-activity';
import type { AuthUser } from '../../src/shared/types/auth';

// Never falls back to the application's DATABASE_URL or a remote database.
const databaseUrl = process.env.HU21_HU25_HU29_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !['/gym_ci', '/gym_migrations', '/gym_hu21_hu25_hu29'].includes(
      url.pathname,
    )
  )
    throw new Error(
      'HU21/HU25/HU29 tests require an ephemeral local PostgreSQL database',
    );
}
const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null;

describe.skipIf(!prisma)('HU21 + HU25 + HU29 PostgreSQL', () => {
  const db = prisma!;
  const sessions = new PrismaTrainingSessionsRepository(db);
  const activity = new PrismaMuscleActivityRepository(db);
  const now = new Date('2026-10-22T02:30:00Z'); // 23:30 on the previous local day.
  let actor: AuthUser;
  let trainer: AuthUser;
  let routineId: string;
  let versionId: string;
  let dayId: string;
  let exerciseId: string;
  let replacementId: string;
  let unclassifiedId: string;
  let assignmentId: string;

  beforeEach(async () => {
    const gymId = randomUUID();
    actor = { id: randomUUID(), gymId, roles: ['ALUMNO'] };
    trainer = { id: randomUUID(), gymId, roles: ['ENTRENADOR'] };
    await db.gym.create({
      data: {
        id: gymId,
        name: `Session integration ${gymId}`,
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    for (const user of [actor, trainer])
      await db.user.create({
        data: {
          id: user.id,
          gymId,
          displayName: 'Fixture',
          emailNormalized: `${user.id}@gimnasio.test`,
          passwordHash: 'fixture',
          roles: { create: user.roles.map((role) => ({ role })) },
        },
      });
    await db.studentProfile.create({
      data: {
        userId: actor.id,
        birthDate: new Date('2000-01-01'),
        sex: 'M',
        heightCm: 175,
        experienceLevel: 'INTERMEDIO',
        availableDaysPerWeek: 3,
      },
    });
    await db.trainerProfile.create({
      data: {
        userId: trainer.id,
        specialty: 'Test',
        experienceYears: 1,
        presentation: 'Fixture',
      },
    });
    const assignment = await db.trainerStudentAssignment.create({
      data: {
        trainerId: trainer.id,
        studentId: actor.id,
        startedByUserId: trainer.id,
        startsAt: new Date('2026-01-01'),
      },
    });
    assignmentId = assignment.id;
    for (const code of GRUPOS_MUSCULARES)
      await db.muscleGroup.upsert({
        where: { code },
        create: {
          code,
          name: code,
          region: 'FIXTURE',
          displayOrder: GRUPOS_MUSCULARES.indexOf(code) + 1,
        },
        update: {},
      });
    async function exercise(name: string, primary?: string) {
      return db.exercise.create({
        data: {
          name,
          instructions: 'Fixture',
          movementPattern: 'EMPUJE_HORIZONTAL',
          difficultyLevel: 'INTERMEDIO',
          origin: 'CATALOGO_BASE',
          visualResourceUrl: 'https://example.test/exercise',
          ...(primary
            ? {
                muscles: {
                  create: [
                    { muscleCode: primary, participation: 'PRIMARIA' as const },
                    ...(primary === 'PECTORAL'
                      ? [
                          {
                            muscleCode: 'TRICEPS',
                            participation: 'SECUNDARIA' as const,
                          },
                          {
                            muscleCode: 'DELTOIDES_ANTERIOR',
                            participation: 'SECUNDARIA' as const,
                          },
                        ]
                      : []),
                  ],
                },
              }
            : {}),
        },
      });
    }
    exerciseId = (await exercise('Bench', 'PECTORAL')).id;
    replacementId = (await exercise('Row', 'DORSAL')).id;
    unclassifiedId = (await exercise('Unclassified')).id;
    const template = await db.routineTemplate.create({
      data: {
        gymId,
        authorTrainerId: trainer.id,
        name: 'Fixture',
        routineType: 'FUERZA',
      },
    });
    const routine = await db.routine.create({
      data: {
        studentId: actor.id,
        sourceTemplateId: template.id,
        routineType: 'FUERZA',
        targetWeeklyFrequency: 3,
        state: 'VIGENTE',
        origin: 'PLANTILLA_ENTRENADOR',
        versions: {
          create: {
            versionNumber: 1,
            current: true,
            createdByUserId: trainer.id,
            days: {
              create: {
                name: 'Day A',
                position: 1,
                dominantPattern: 'EMPUJE_HORIZONTAL',
                exercises: {
                  create: [
                    {
                      exerciseId,
                      position: 1,
                      note: 'Frozen note',
                      sets: {
                        create: [1, 2, 3, 4].map((position) => ({
                          position,
                          minRepetitions: 6,
                          maxRepetitions: 10,
                          suggestedLoad: 40,
                          restSeconds: 120,
                          warmup: position === 1,
                        })),
                      },
                    },
                    {
                      exerciseId: replacementId,
                      position: 2,
                      sets: {
                        create: {
                          position: 1,
                          minRepetitions: 5,
                          maxRepetitions: 8,
                          suggestedLoad: null,
                          restSeconds: 90,
                          warmup: false,
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
      include: { versions: { include: { days: true } } },
    });
    routineId = routine.id;
    versionId = routine.versions[0]!.id;
    dayId = routine.versions[0]!.days[0]!.id;
  });
  afterAll(async () => {
    await prisma?.$disconnect();
  });

  const start = () =>
    sessions.start({ actor, studentId: actor.id, routineDayId: dayId, now });
  const read = (sessionId: string, reader = actor) =>
    sessions.getById({ actor: reader, studentId: actor.id, sessionId, now });
  const patch = (
    sessionId: string,
    position: number,
    values: Record<string, unknown>,
  ) =>
    sessions.updateSeries({
      actor,
      studentId: actor.id,
      sessionId,
      position,
      now,
      ...values,
    });
  const measure = async (
    reader = actor,
    from = '2026-10-21',
    to = '2026-10-21',
  ) => {
    const raw = await activity.aggregate({
      actor: reader,
      studentId: actor.id,
      from,
      to,
      now,
    });
    return raw
      ? presentMuscleActivity(raw.sessionCount, raw.aggregates, raw.exercises)
      : null;
  };
  const finish = (sessionId: string) =>
    sessions.finish({
      actor,
      studentId: actor.id,
      sessionId,
      now: new Date('2026-10-22T03:40:00Z'),
    });

  it('freezes all prescription fields and local start date across routine/catalog changes, archiving and midnight', async () => {
    const session = await start();
    expect(session.setRecords.map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    expect(session.setRecords[0]).toMatchObject({
      prescribedRestSeconds: 120,
      prescribedExercisePosition: 1,
      prescribedSetPosition: 1,
      prescribedNote: 'Frozen note',
      prescribedWarmup: true,
    });
    expect(session.setRecords[4]).toMatchObject({
      prescribedExercisePosition: 2,
      prescribedSetPosition: 1,
      prescribedLoad: null,
    });
    expect(session.occurredOn).toBe('2026-10-21');
    await db.routineDay.update({
      where: { id: dayId },
      data: { name: 'Edited day' },
    });
    await db.prescribedSet.updateMany({
      where: { routineExercise: { routineDayId: dayId } },
      data: { minRepetitions: 12, maxRepetitions: 15, restSeconds: 30 },
    });
    await db.exercise.update({
      where: { id: exerciseId },
      data: { name: 'Changed name', state: 'DESACTIVADO' },
    });
    await db.routine.update({
      where: { id: routineId },
      data: { state: 'ARCHIVADA' },
    });
    expect((await read(session.id)).setRecords).toEqual(session.setRecords);
    const ended = await finish(session.id);
    expect(ended.routineVersionId).toBe(versionId);
    expect(ended.routineDayName).toBe('Day A');
    expect(ended.occurredOn).toBe('2026-10-21');
    expect(ended.durationSeconds).toBe(4200);
    expect(ended.timezone).toBe('America/Argentina/Buenos_Aires');
  });

  it('rolls back the session and every nested record on a failure after insertion', async () => {
    const failing = db.$extends({
      query: {
        trainingSession: {
          async create({ args, query }) {
            await query(args);
            throw new Error('Injected snapshot failure');
          },
        },
      },
    });
    const repository = new PrismaTrainingSessionsRepository(
      failing as unknown as PrismaClient,
    );
    await expect(
      repository.start({
        actor,
        studentId: actor.id,
        routineDayId: dayId,
        now,
      }),
    ).rejects.toThrow('Injected snapshot failure');
    expect(
      await db.trainingSession.count({ where: { studentId: actor.id } }),
    ).toBe(0);
    expect(
      await db.sessionSetRecord.count({
        where: { prescribedExerciseId: exerciseId },
      }),
    ).toBe(0);
  });

  it('preserves prescription and version identity at the database boundary', async () => {
    const session = await start();
    await expect(
      db.sessionSetRecord.updateMany({
        where: { sessionId: session.id },
        data: { prescribedRestSeconds: 999 },
      }),
    ).rejects.toThrow();
    await expect(
      db.trainingSession.update({
        where: { id: session.id },
        data: { routineVersionId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(patch(session.id, 2, { additional: true })).rejects.toThrow();
    expect((await read(session.id)).setRecords).toEqual(session.setRecords);
  });

  it('keeps substitutes, omissions and additional work, counts only real completed work and recalculates corrections', async () => {
    const session = await start();
    await patch(session.id, 1, {
      completed: true,
      performedLoad: 20,
      performedRepetitions: 10,
    }); // warmup
    await patch(session.id, 2, {
      completed: true,
      performedLoad: 40,
      performedRepetitions: 10,
    });
    await patch(session.id, 3, {
      completed: true,
      performedExerciseId: replacementId,
      performedLoad: 30,
      performedRepetitions: 8,
    });
    await patch(session.id, 4, { completed: false, omissionReason: 'Fatigue' });
    await patch(session.id, 6, {
      additional: true,
      completed: true,
      performedExerciseId: exerciseId,
      performedLoad: 40,
      performedRepetitions: 10,
    });
    await patch(session.id, 6, { additional: true, completed: true }); // idempotent retry
    await patch(session.id, 7, {
      additional: true,
      completed: true,
      performedExerciseId: unclassifiedId,
      performedLoad: 0,
      performedRepetitions: 10,
    });
    const detail = await read(session.id);
    expect(detail.setRecords[2]).toMatchObject({
      prescribedExerciseId: exerciseId,
      performedExerciseId: replacementId,
    });
    expect(detail.setRecords[3]).toMatchObject({
      completed: false,
      omissionReason: 'Fatigue',
    });
    expect(detail.setRecords[5]).toMatchObject({
      additional: true,
      prescribedExerciseId: null,
      prescribedMinRepetitions: null,
      prescribedLoad: null,
      prescribedWarmup: null,
    });
    expect(
      await db.sessionAdditionalSetRecord.count({
        where: { sessionId: session.id },
      }),
    ).toBe(2);
    await finish(session.id);
    const result = await measure();
    expect(result!.groups.find((g) => g.group === 'PECTORAL')).toMatchObject({
      volume: 2,
      frequency: 1,
    });
    expect(result!.groups.find((g) => g.group === 'TRICEPS')).toMatchObject({
      volume: 1,
      frequency: 1,
    });
    expect(result!.groups.find((g) => g.group === 'DORSAL')).toMatchObject({
      volume: 1,
      frequency: 1,
    });
    expect(
      result!.exerciseVolumes.find((e) => e.exerciseId === unclassifiedId)!
        .classification,
    ).toBe('NO_CLASIFICADO');
    await patch(session.id, 2, {
      completed: false,
      omissionReason: 'Corrected',
      now: new Date('2026-10-22T03:45:00Z'),
    });
    expect(
      (await measure())!.groups.find((g) => g.group === 'PECTORAL')!.volume,
    ).toBe(1);
    expect(
      (await measure(actor, '2026-10-20', '2026-10-20'))!.groups.every(
        (g) => g.status === 'SIN_DATOS',
      ),
    ).toBe(true);
  });

  it('enforces global set position uniqueness, including concurrent retries of additional sets', async () => {
    const session = await start();
    await expect(
      db.sessionAdditionalSetRecord.create({
        data: {
          sessionId: session.id,
          position: 1,
          performedExerciseId: exerciseId,
          performedExerciseName: 'Bench',
        },
      }),
    ).rejects.toThrow();
    await Promise.all([
      patch(session.id, 6, {
        additional: true,
        performedExerciseId: exerciseId,
      }),
      patch(session.id, 6, {
        additional: true,
        performedExerciseId: exerciseId,
      }),
    ]);
    expect(
      await db.sessionAdditionalSetRecord.count({
        where: { sessionId: session.id, position: 6 },
      }),
    ).toBe(1);
  });

  it('counts frequency once per session and excludes additional warmups and out-of-period work', async () => {
    for (let index = 0; index < 2; index++) {
      const session = await start();
      for (const position of [2, 3])
        await patch(session.id, position, {
          completed: true,
          performedLoad: 40,
          performedRepetitions: 10,
        });
      await patch(session.id, 6, {
        additional: true,
        performedWarmup: true,
        completed: true,
        performedExerciseId: exerciseId,
        performedLoad: 20,
        performedRepetitions: 10,
      });
      await finish(session.id);
    }
    expect(
      (await measure())!.groups.find((g) => g.group === 'PECTORAL'),
    ).toMatchObject({ volume: 4, frequency: 2 });
    expect(
      (await measure())!.groups.find((g) => g.group === 'TRICEPS'),
    ).toMatchObject({ volume: 2, frequency: 2 });
    expect(
      (await measure(actor, '2026-10-20', '2026-10-20'))!.groups.every(
        (g) => g.volume === null,
      ),
    ).toBe(true);
    await expect(measure(actor, '2026-10-22', '2026-10-22')).rejects.toThrow(
      RangeError,
    );
  });

  it('commits inactivity abandonment at exactly eight hours and rejects corrections after 48 hours', async () => {
    const session = await start();
    await expect(
      patch(session.id, 2, {
        performedLoad: 40,
        now: new Date(now.getTime() + 8 * 3600000),
      }),
    ).rejects.toThrow();
    expect((await read(session.id)).state).toBe('ABANDONADA');
    const next = await start();
    const completed = await finish(next.id);
    await expect(
      patch(next.id, 2, {
        performedLoad: 40,
        now: new Date(completed.completedAt!.getTime() + 48 * 3600000),
      }),
    ).rejects.toThrow();
    expect((await read(next.id)).setRecords).toEqual(completed.setRecords);
  });

  it('retains partial abandoned history while excluding it from indicators; identifies and excludes simulations', async () => {
    const session = await start();
    await patch(session.id, 2, {
      completed: true,
      performedLoad: 40,
      performedRepetitions: 10,
    });
    await sessions.abandon({
      actor,
      studentId: actor.id,
      sessionId: session.id,
      now,
    });
    expect((await read(session.id)).setRecords[1]!.performedLoad).toBe(40);
    await db.trainingSession.create({
      data: {
        studentId: actor.id,
        routineId,
        routineVersionId: versionId,
        routineDayId: dayId,
        state: 'COMPLETADA',
        startedAt: now,
        completedAt: now,
        occurredOn: new Date('2026-10-21'),
        simulated: true,
        setRecords: {
          create: {
            position: 1,
            prescribedExerciseId: exerciseId,
            prescribedMinRepetitions: 6,
            prescribedMaxRepetitions: 10,
            performedExerciseId: exerciseId,
            performedLoad: 40,
            performedRepetitions: 10,
            completed: true,
          },
        },
      },
    });
    const list = await sessions.list({
      actor,
      studentId: actor.id,
      now,
      page: 1,
      pageSize: 20,
    });
    expect(list.items.some((item) => item.simulated)).toBe(true);
    expect(list.items.some((item) => item.state === 'ABANDONADA')).toBe(true);
    expect((await measure())!.groups.every((g) => g.volume === null)).toBe(
      true,
    );
  });

  it('uses current assignment and tenant checks for listing, detail and muscle indicators', async () => {
    const session = await start();
    expect(await read(session.id, trainer)).toBeDefined();
    expect(await measure(trainer)).not.toBeNull();
    await db.trainerStudentAssignment.update({
      where: { id: assignmentId },
      data: { endsAt: new Date('2026-10-01'), endedByUserId: trainer.id },
    });
    await expect(read(session.id, trainer)).rejects.toThrow();
    await expect(
      sessions.list({
        actor: trainer,
        studentId: actor.id,
        now,
        page: 1,
        pageSize: 20,
      }),
    ).rejects.toThrow();
    expect(await measure(trainer)).toBeNull();
    await expect(
      read(session.id, { ...actor, gymId: randomUUID() }),
    ).rejects.toThrow();
    await expect(
      read(session.id, { ...trainer, roles: ['ADMINISTRADOR'] }),
    ).rejects.toThrow();
  });

  it('takes one consistent version when publication overlaps snapshot creation', async () => {
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const selected = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const controlled = db.$extends({
      query: {
        trainingSession: {
          async create({ args, query }) {
            reached();
            await gate;
            return query(args);
          },
        },
      },
    });
    const pending = new PrismaTrainingSessionsRepository(
      controlled as unknown as PrismaClient,
    ).start({ actor, studentId: actor.id, routineDayId: dayId, now });
    await selected;
    try {
      await db.$transaction(async (tx) => {
        await tx.routineVersion.update({
          where: { id: versionId },
          data: { current: false },
        });
        await tx.routineVersion.create({
          data: {
            routineId,
            versionNumber: 2,
            current: true,
            createdByUserId: trainer.id,
            days: {
              create: {
                position: 1,
                name: 'New day',
                dominantPattern: 'EMPUJE_HORIZONTAL',
                exercises: {
                  create: {
                    position: 1,
                    exerciseId,
                    sets: {
                      create: {
                        position: 1,
                        minRepetitions: 12,
                        maxRepetitions: 15,
                        restSeconds: 30,
                      },
                    },
                  },
                },
              },
            },
          },
        });
      });
    } finally {
      release();
    }
    const snapshot = await pending;
    expect(snapshot.routineVersionId).toBe(versionId);
    expect(snapshot.setRecords[0]!.prescribedRestSeconds).toBe(120);
    await sessions.abandon({
      actor,
      studentId: actor.id,
      sessionId: snapshot.id,
      now,
    });
    expect(
      (
        await sessions.start({
          actor,
          studentId: actor.id,
          routineDayId: '',
          now,
        })
      ).routineVersionNumber,
    ).toBe(2);
  });

  it('paginates 10,000 sessions stably with microsecond ties and measures p95 with 300 students / 150,000 records', async () => {
    await db.$executeRaw`INSERT INTO app.training_sessions (student_id, routine_id, routine_version_id, routine_day_id, state, started_at, completed_at, occurred_on)
      SELECT ${actor.id}::uuid, ${routineId}::uuid, ${versionId}::uuid, ${dayId}::uuid, 'BLOQUEADA', ${now}::timestamptz + interval '0.123456 second', ${now}::timestamptz + interval '0.123456 second', '2026-10-21'::date FROM generate_series(1, 10000)`;
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await sessions.list({
        actor,
        studentId: actor.id,
        now,
        page: 1,
        pageSize: 50,
        ...(cursor ? { cursor } : {}),
      });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.size).toBe(10000);
    const students = Array.from({ length: 299 }, () => randomUUID());
    await db.user.createMany({
      data: students.map((id) => ({
        id,
        gymId: actor.gymId,
        emailNormalized: `${id}@gimnasio.test`,
        displayName: 'Performance fixture',
        passwordHash: 'fixture',
      })),
    });
    await db.userRoleAssignment.createMany({
      data: students.map((userId) => ({ userId, role: 'ALUMNO' as const })),
    });
    await db.studentProfile.createMany({
      data: students.map((userId) => ({
        userId,
        birthDate: new Date('2000-01-01'),
        sex: 'M' as const,
        heightCm: 175,
        experienceLevel: 'INTERMEDIO' as const,
        availableDaysPerWeek: 3,
      })),
    });
    const templateId = (
      await db.routine.findUniqueOrThrow({ where: { id: routineId } })
    ).sourceTemplateId!;
    const routines = students.map((studentId) => ({
      id: randomUUID(),
      studentId,
      sourceTemplateId: templateId,
      routineType: 'FUERZA' as const,
      targetWeeklyFrequency: 3,
      state: 'ARCHIVADA' as const,
      origin: 'PLANTILLA_ENTRENADOR' as const,
    }));
    await db.routine.createMany({ data: routines });
    const versions = routines.map((routine) => ({
      id: randomUUID(),
      routineId: routine.id,
      versionNumber: 1,
      createdByUserId: trainer.id,
    }));
    await db.routineVersion.createMany({ data: versions });
    const days = versions.map((version) => ({
      id: randomUUID(),
      routineVersionId: version.id,
      position: 1,
      name: 'Performance fixture',
      dominantPattern: 'EMPUJE_HORIZONTAL' as const,
    }));
    await db.routineDay.createMany({ data: days });
    const fixtures = [
      ...routines.map((routine, index) => ({
        id: randomUUID(),
        studentId: routine.studentId,
        routineId: routine.id,
        routineVersionId: versions[index]!.id,
        routineDayId: days[index]!.id,
        state: 'BLOQUEADA' as const,
        startedAt: now,
        completedAt: now,
        occurredOn: new Date('2026-10-21'),
      })),
      {
        id: randomUUID(),
        studentId: actor.id,
        routineId,
        routineVersionId: versionId,
        routineDayId: dayId,
        state: 'BLOQUEADA' as const,
        startedAt: now,
        completedAt: now,
        occurredOn: new Date('2026-10-21'),
      },
    ];
    await db.trainingSession.createMany({ data: fixtures });
    await db.$executeRaw`INSERT INTO app.session_set_records (session_id, position, prescribed_exercise_id, prescribed_min_repetitions, prescribed_max_repetitions, performed_exercise_id, performed_load, performed_repetitions, completed)
      SELECT s.id, n, ${exerciseId}::uuid, 6, 10, ${exerciseId}::uuid, 40, 10, true
      FROM app.training_sessions s CROSS JOIN generate_series(1, 500) n
      WHERE s.id = ANY(${fixtures.map((fixture) => fixture.id)}::uuid[])`;
    expect(
      await db.sessionSetRecord.count({
        where: { sessionId: { in: fixtures.map((fixture) => fixture.id) } },
      }),
    ).toBe(150000);
    const durations: number[] = [];
    for (let index = 0; index < 20; index++) {
      const before = performance.now();
      await sessions.list({
        actor,
        studentId: actor.id,
        now,
        page: 1,
        pageSize: 20,
      });
      await measure();
      durations.push(performance.now() - before);
    }
    durations.sort((a, b) => a - b);
    expect(durations[18]).toBeLessThan(500);
    // RNF-02 full UI load remains outside this backend-only task.
  }, 300000);
});
