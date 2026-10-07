import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaExerciseCatalogRepository } from '../../src/modules/exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import { ExerciseCatalogService } from '../../src/modules/exercise-catalog/application/catalog.service';
import { PrismaGenerationContextRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { PrismaRoutineGenerationsRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-routine-generations.repository';
import { PrismaGeneratedRoutinesRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-generated-routines.repository';
import { PrismaPrescriptionsRepository } from '../../src/modules/prescriptions/infrastructure/persistence/prisma-prescriptions.repository';
import type {
  CatalogActor,
  ExerciseInput,
} from '../../src/modules/exercise-catalog/domain/catalog';

const url = process.env.CATALOG_TEST_DATABASE_URL;
if (url) {
  const target = new URL(url);
  if (
    target.hostname !== '127.0.0.1' ||
    target.port !== '55434' ||
    target.pathname !== '/gym_catalog_test'
  )
    throw new Error(
      'Catalogue tests require the isolated gym_catalog_test database on localhost:55434',
    );
}
const database = new PrismaClient({
  datasourceUrl: url ?? 'postgresql://unused@127.0.0.1:1/unused',
});
const catalog = new PrismaExerciseCatalogRepository(database);
const service = new ExerciseCatalogService(catalog);
const context = new PrismaGenerationContextRepository(database);
const generations = new PrismaRoutineGenerationsRepository(database);
const finalizer = new PrismaGeneratedRoutinesRepository(database);
const prescriptions = new PrismaPrescriptionsRepository(database);
const gymId = randomUUID();
const otherGymId = randomUUID();
const admin: CatalogActor = {
  id: randomUUID(),
  gymId,
  roles: ['ADMINISTRADOR'],
};
const trainer: CatalogActor = {
  id: randomUUID(),
  gymId,
  roles: ['ENTRENADOR'],
};
const student: CatalogActor = { id: randomUUID(), gymId, roles: ['ALUMNO'] };
const otherTrainer: CatalogActor = {
  id: randomUUID(),
  gymId: otherGymId,
  roles: ['ENTRENADOR'],
};
const prefix = randomUUID().slice(0, 8);
const input: ExerciseInput = {
  name: `Synthetic exercise ${prefix}`,
  description: 'Original synthetic fixture.',
  instructions:
    'Synthetic instructions used only to test catalogue persistence.',
  tips: [],
  movementPattern: 'CORE',
  difficultyLevel: 'AVANZADO',
  unilateral: false,
  equipment: ['PESO_CORPORAL'],
  primaryMuscles: [`M1_${prefix}`, `M2_${prefix}`],
  secondaryMuscles: [],
  joints: [`J_${prefix}`],
  media: [{ pose: 'PRINCIPAL', url: 'https://example.test/original.webp' }],
};
let baseId: string;
let optionalOwnId: string;

describe.skipIf(!url)('Catalogue and generation on isolated PostgreSQL', () => {
  beforeAll(async () => {
    await database.gym.createMany({
      data: [
        { id: gymId, name: `Test ${prefix}`, timezone: 'America/Buenos_Aires' },
        {
          id: otherGymId,
          name: `Other ${prefix}`,
          timezone: 'America/Buenos_Aires',
        },
      ],
    });
    for (const actor of [admin, trainer, student, otherTrainer])
      await database.user.create({
        data: {
          id: actor.id,
          gymId: actor.gymId,
          emailNormalized: `${actor.id}@example.test`,
          displayName: 'Synthetic actor',
          passwordHash: 'synthetic-not-a-password',
          roles: {
            create: actor.roles.map((role) => ({
              role: role as 'ALUMNO' | 'ENTRENADOR' | 'ADMINISTRADOR',
            })),
          },
        },
      });
    await database.studentProfile.create({
      data: {
        userId: student.id,
        birthDate: new Date('1998-01-01'),
        sex: 'X',
        heightCm: 170,
        experienceLevel: 'PRINCIPIANTE',
        availableDaysPerWeek: 1,
      },
    });
    await database.trainerProfile.create({
      data: {
        userId: trainer.id,
        specialty: 'Synthetic',
        experienceYears: 1,
        presentation: 'Fixture',
      },
    });
    await database.trainerStudentAssignment.create({
      data: {
        studentId: student.id,
        trainerId: trainer.id,
        startsAt: new Date('2020-01-01'),
        startedByUserId: admin.id,
      },
    });
    const equipmentOrder = await database.equipment.aggregate({
      _max: { displayOrder: true },
    });
    await database.equipment.upsert({
      where: { code: 'PESO_CORPORAL' },
      create: {
        code: 'PESO_CORPORAL',
        name: 'Peso corporal',
        displayOrder: (equipmentOrder._max.displayOrder ?? 0) + 1,
      },
      update: {},
    });
    const muscleOrder = await database.muscleGroup.aggregate({
      _max: { displayOrder: true },
    });
    await database.muscleGroup.createMany({
      data: input.primaryMuscles.map((code, i) => ({
        code,
        name: code,
        region: 'CORE',
        displayOrder: (muscleOrder._max.displayOrder ?? 0) + i + 1,
      })),
    });
    const jointOrder = await database.joint.aggregate({
      _max: { displayOrder: true },
    });
    await database.joint.create({
      data: {
        code: input.joints[0]!,
        name: input.joints[0]!,
        region: 'CORE',
        displayOrder: (jointOrder._max.displayOrder ?? 0) + 1,
      },
    });
    const base = await database.exercise.create({
      data: {
        name: `Base ${prefix}`,
        instructions: input.instructions,
        movementPattern: 'CORE',
        difficultyLevel: 'AVANZADO',
        visualResourceUrl: input.media[0]!.url,
        origin: 'CATALOGO_BASE',
        source: 'Synthetic',
        sourceId: prefix,
        equipment: { create: { equipmentCode: 'PESO_CORPORAL' } },
        muscles: {
          create: input.primaryMuscles.map((muscleCode) => ({
            muscleCode,
            participation: 'PRIMARIA',
          })),
        },
        joints: { create: { jointCode: input.joints[0]! } },
      },
    });
    baseId = base.id;
  });
  afterAll(async () => {
    await database.$disconnect();
  });

  it('keeps bodyweight and all base exercises disabled until explicitly assigned', async () => {
    expect(await context.getEnabledCatalog(gymId)).toEqual([]);
    expect((await catalog.find(student, baseId))?.enabled).toBe(false);
  });

  it('scopes availability to the gym, is idempotent, and preserves multi-primary membership', async () => {
    expect(
      await service.setAvailability(admin, [
        { exerciseId: baseId, enabled: true, expectedRevision: null },
      ]),
    ).toEqual({ changed: 1 });
    expect(
      await service.setAvailability(admin, [
        { exerciseId: baseId, enabled: true, expectedRevision: null },
      ]),
    ).toEqual({ changed: 0 });
    expect(await context.getEnabledCatalog(otherGymId)).toEqual([]);
    const entries = await context.getEnabledCatalog(gymId);
    expect(entries[0]?.musculosPrimarios).toEqual(
      [...input.primaryMuscles].sort(),
    );
    // An advanced entry reaches the AI for a beginner; no training compatibility filter.
    expect(entries[0]?.dificultad).toBe('AVANZADO');
    expect(entries[0]?.instrucciones).toBe(input.instructions);
  });

  it('requires approval of own exercises, rejects foreign scope, and rolls back an invalid batch', async () => {
    const own = await service.create(trainer, input);
    expect(own.state).toBe('PROPUESTO');
    expect(own.enabled).toBe(false);
    await expect(
      service.setAvailability(admin, [
        { exerciseId: own.id, enabled: true, expectedRevision: null },
      ]),
    ).rejects.toMatchObject({ code: 'exercise_not_approved' });
    await expect(
      service.update(otherTrainer, own.id, own.revision, input),
    ).rejects.toMatchObject({ code: 'exercise_not_found' });
    const foreign = await service.create(otherTrainer, {
      ...input,
      name: `Foreign ${prefix}`,
    });
    await expect(
      service.setAvailability(admin, [
        { exerciseId: baseId, enabled: false, expectedRevision: 1 },
        { exerciseId: foreign.id, enabled: true, expectedRevision: null },
      ]),
    ).rejects.toMatchObject({ code: 'exercise_not_found' });
    expect((await catalog.find(student, baseId))?.enabled).toBe(true);
    const approved = await service.review(
      admin,
      own.id,
      own.revision,
      'APROBADO',
      null,
    );
    expect(approved.enabled).toBe(false);
    optionalOwnId = own.id;
    await expect(
      service.update(trainer, own.id, approved.revision, input),
    ).rejects.toMatchObject({ code: 'approved_exercise_requires_retirement' });
  });

  it('serializes concurrent availability writes and detects stale revisions including disable/re-enable', async () => {
    const snapshot = await catalog.find(admin, baseId);
    const commands = [0, 1].map(() =>
      service.setAvailability(admin, [
        {
          exerciseId: baseId,
          enabled: false,
          expectedRevision: snapshot!.availabilityRevision,
        },
      ]),
    );
    const responses = await Promise.all(commands);
    expect(responses.map((item) => item.changed).sort()).toEqual([0, 1]);
    await expect(
      service.setAvailability(admin, [
        {
          exerciseId: baseId,
          enabled: true,
          expectedRevision: snapshot!.availabilityRevision,
        },
      ]),
    ).rejects.toMatchObject({ code: 'availability_conflict' });
    const disabled = await catalog.find(admin, baseId);
    await service.setAvailability(admin, [
      {
        exerciseId: baseId,
        enabled: true,
        expectedRevision: disabled!.availabilityRevision,
      },
    ]);
    expect(
      (await catalog.find(admin, baseId))!.availabilityRevision,
    ).toBeGreaterThan(snapshot!.availabilityRevision!);
  });

  async function completedRequest() {
    const captured = await context.getStudentContext(student.id, new Date());
    const entries = await context.getEnabledCatalog(gymId);
    const request = await generations.createOrGetRequest({
      idempotencyKey: randomUUID(),
      minimizedContext: captured!.minimizedContext,
      ownership: { studentId: student.id, requestedByUserId: student.id },
      preferences: {
        schema_version: '2.0',
        free_text: 'Propuesta sintética para revisión.',
        parameters: null,
        allowed_catalog: entries.map((entry) => ({
          id: entry.id,
          name: entry.nombre,
          movement_pattern: entry.patronMovimiento,
          revision: entry.revision,
          availability_revision: entry.availabilityRevision,
        })),
      },
      retentionUntil: new Date(Date.now() + 86400000),
    });
    const attempt = await database.aiGenerationAttempt.create({
      data: {
        requestId: request.requestId,
        attemptNumber: 1,
        state: 'COMPLETADO',
        contractVersion: 'routine-generation@2.0',
        inputHash: '0'.repeat(64),
        modelVersion: 'synthetic',
        configurationVersion: 'test',
      },
    });
    await database.aiGenerationResult.create({
      data: {
        attemptId: attempt.id,
        structuredOutput: {
          schema_version: '2.0',
          outcome: 'PROPOSED',
          routine_type: 'FUERZA',
          target_weekly_frequency: 1,
          days: [
            {
              position: 1,
              name: 'Synthetic day',
              dominant_pattern: 'CORE',
              exercises: [
                {
                  position: 1,
                  exercise_id: baseId,
                  note: null,
                  sets: [
                    {
                      position: 1,
                      min_repetitions: 1,
                      max_repetitions: 2,
                      suggested_load: null,
                      rest_seconds: 1000,
                      warmup: false,
                    },
                  ],
                },
              ],
            },
          ],
          explanation: 'Synthetic AI proposal.',
          warnings: [],
        },
        structurallyValid: true,
        outputHash: '1'.repeat(64),
        retentionUntil: new Date(Date.now() + 86400000),
      },
    });
    await database.aiGenerationRequest.update({
      where: { id: request.requestId },
      data: { state: 'COMPLETADA' },
    });
    return {
      requestId: request.requestId,
      studentId: student.id,
      requestedByUserId: student.id,
    };
  }

  it('uses local calendar dates for inclusive validity and excludes future measurements', async () => {
    const today = new Date('2026-10-06');
    const tomorrow = new Date('2026-10-07');
    await database.goal.create({
      data: {
        studentId: student.id,
        type: 'FUERZA',
        startsOn: new Date('2026-10-05'),
        endsOn: today,
      },
    });
    await database.fitnessClearance.create({
      data: {
        studentId: student.id,
        recordedByUserId: trainer.id,
        issuedOn: new Date('2026-10-05'),
        expiresOn: today,
      },
    });
    await database.bodyMeasurement.createMany({
      data: [
        {
          studentId: student.id,
          type: 'PESO_CORPORAL',
          value: 70,
          measuredOn: today,
        },
        {
          studentId: student.id,
          type: 'PESO_CORPORAL',
          value: 80,
          measuredOn: tomorrow,
        },
      ],
    });
    const captured = await context.getStudentContext(
      student.id,
      new Date('2026-10-07T00:30:00Z'),
    );
    expect(captured!.minimizedContext.history!.period_end).toBe('2026-10-06');
    expect(captured!.minimizedContext.objetivosActivos).toEqual(['FUERZA']);
    expect(captured!.minimizedContext.fitness_clearance).toBe('VIGENTE');
    expect(captured!.minimizedContext.profile!.weight_kg).toBe(70);
  });

  it('rejects a selected exercise changed while inference was running', async () => {
    const owner = await completedRequest();
    const item = await catalog.find(admin, baseId);
    await service.setAvailability(admin, [
      {
        exerciseId: baseId,
        enabled: false,
        expectedRevision: item!.availabilityRevision,
      },
    ]);
    await expect(finalizer.finalize(owner)).rejects.toHaveProperty(
      'name',
      'GenerationContextChangedError',
    );
    const disabled = await catalog.find(admin, baseId);
    await service.setAvailability(admin, [
      {
        exerciseId: baseId,
        enabled: true,
        expectedRevision: disabled!.availabilityRevision,
      },
    ]);
    await expect(finalizer.finalize(owner)).rejects.toHaveProperty(
      'name',
      'GenerationContextChangedError',
    );
  });

  it('creates one proposal idempotently, rejects stale trainer review, and retains prescribed history', async () => {
    const owner = await completedRequest();
    await service.setAvailability(admin, [
      { exerciseId: optionalOwnId, enabled: true, expectedRevision: null },
    ]);
    const [proposal, concurrent] = await Promise.all([
      finalizer.finalize(owner),
      finalizer.finalize(owner),
    ]);
    expect(concurrent).toEqual(proposal);
    expect(await finalizer.finalize(owner)).toEqual(proposal);
    const content = await prescriptions.findContent(
      student.id,
      proposal.routineId,
    );
    expect(content!.generationExplanation).toBe('Synthetic AI proposal.');
    expect(content!.days[0]!.exercises[0]!.sets[0]!.restSeconds).toBe(1000);
    await database.studentProfile.update({
      where: { userId: student.id },
      data: { availableDaysPerWeek: 2 },
    });
    await expect(
      prescriptions.review({
        routineId: proposal.routineId,
        versionId: content!.versionId,
        reviewerTrainerId: trainer.id,
        result: 'APROBADA',
        observation: null,
        previousActiveRoutineId: null,
        reviewToken: content!.reviewToken,
      }),
    ).rejects.toMatchObject({ code: 'routine_review_conflict' });
    const refreshed = await prescriptions.findContent(
      student.id,
      proposal.routineId,
    );
    await prescriptions.review({
      routineId: proposal.routineId,
      versionId: content!.versionId,
      reviewerTrainerId: trainer.id,
      result: 'APROBADA',
      observation: null,
      previousActiveRoutineId: null,
      reviewToken: refreshed!.reviewToken,
    });
    const routineDay = await database.routineDay.findFirstOrThrow({
      where: { routineVersionId: content!.versionId },
      select: { id: true },
    });
    const session = await database.trainingSession.create({
      data: {
        studentId: student.id,
        routineId: proposal.routineId,
        routineVersionId: content!.versionId,
        routineDayId: routineDay.id,
        occurredOn: new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    const frozen = await database.sessionSetRecord.create({
      data: {
        sessionId: session.id,
        position: 1,
        prescribedExerciseId: baseId,
        prescribedMinRepetitions: 1,
        prescribedMaxRepetitions: 2,
        prescribedLoad: null,
      },
    });
    const item = await catalog.find(admin, baseId);
    await service.setAvailability(admin, [
      {
        exerciseId: baseId,
        enabled: false,
        expectedRevision: item!.availabilityRevision,
      },
    ]);
    const historical = await prescriptions.findContent(
      student.id,
      proposal.routineId,
    );
    expect(historical!.days[0]!.exercises[0]!.available).toBe(false);
    expect(historical!.days[0]!.exercises[0]!.sets).toEqual(
      content!.days[0]!.exercises[0]!.sets,
    );
    expect(
      (
        await database.sessionSetRecord.findUniqueOrThrow({
          where: { id: frozen.id },
        })
      ).prescribedLoad,
    ).toBeNull();
    expect(
      await database.routineExercise.count({
        where: {
          exerciseId: baseId,
          compatibilityState: 'EJERCICIO_DESACTIVADO',
        },
      }),
    ).toBeGreaterThan(0);
  });
});
