import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../../src/app';
import { PrismaRoutineRenewalsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-routine-renewals.repository';
import { PrismaProposalsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-proposals.repository';
import { toProposalReviewDto } from '../../src/modules/evolution/application/dto/proposal.dto';
import { RenewRoutineCyclesUseCase } from '../../src/modules/evolution/application/use-cases/renew-routine-cycles.use-case';
import { ResolveProposalUseCase } from '../../src/modules/evolution/application/use-cases/resolve-proposal.use-case';
import { RequestRoutineGenerationUseCase } from '../../src/modules/routine-generations/application/use-cases/request-routine-generation.use-case';
import { PrismaGenerationContextRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { PrismaGeneratedRoutinesRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-generated-routines.repository';
import { PrismaRoutineGenerationsRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-routine-generations.repository';
import { EvaluateMeasurementCheckpointsUseCase } from '../../src/modules/students/application/use-cases/evaluate-measurement-checkpoints.use-case';
import { PrismaMeasurementCheckpointsRepository } from '../../src/modules/students/infrastructure/persistence/prisma-measurement-checkpoints.repository';
import { PrismaTrainerAssignments } from '../../src/modules/students/infrastructure/persistence/prisma-trainer-assignments.repository';
import { addDays } from '../../src/modules/routines/domain/services/routine-renewal';
import { PrismaRoutinesRepository } from '../../src/modules/routines/infrastructure/persistence/prisma-routines.repository';
import { PrismaStudentsRepository } from '../../src/modules/students/infrastructure/persistence/prisma-students.repository';
import { PrismaProposalRegenerationsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-proposal-regenerations.repository';
import { RegenerateProposalUseCase } from '../../src/modules/evolution/application/use-cases/regenerate-proposal.use-case';
import { PrismaGenerationSettingsRepository } from '../../src/modules/gyms/infrastructure/persistence/prisma-generation-settings.repository';
import type { RoutineGenerationPreferences } from '../../src/modules/routine-generations/application/dto/routine-generation-context.dto';

const url = process.env.RENEWAL_TEST_DATABASE_URL;
const suite = describe.skipIf(!url);
const start = new Date('2026-09-28T03:00:00Z');
let now = addDays(start, 60);
let db: PrismaClient;
let studentId: string;
let trainerId: string;
let routineId: string;
let versionId: string;
let exerciseId: string;
let replacementId: string;
let gateway: { dispatchGeneration: ReturnType<typeof vi.fn> };
let job: RenewRoutineCyclesUseCase;
let renewals: PrismaRoutineRenewalsRepository;

suite('automatic routine renewal with real PostgreSQL (HU03)', () => {
  beforeAll(() => {
    // Destructive fixture cleanup is authorized only on this disposable QA database.
    const parsed = new URL(url!);
    if (
      parsed.hostname !== '127.0.0.1' ||
      parsed.port !== '65433' ||
      parsed.pathname !== '/gym_renewal_qa'
    )
      throw new Error(
        'Renewal QA requires the isolated local gym_renewal_qa database on port 65433',
      );
    db = new PrismaClient({ datasources: { db: { url: url! } } });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  beforeEach(async () => {
    await db.$executeRaw`TRUNCATE app.gyms, ai_integration.ai_generation_requests CASCADE`;
    now = addDays(start, 60);
    const gym = await db.gym.create({
      data: { name: 'Renewal QA', timezone: 'America/Argentina/Buenos_Aires' },
    });
    const trainer = await db.user.create({
      data: {
        gymId: gym.id,
        emailNormalized: 'trainer@renewal.example.test',
        displayName: 'Synthetic trainer',
        passwordHash: 'unused',
        roles: { create: { role: 'ENTRENADOR' } },
        trainerProfile: {
          create: { specialty: 'QA', experienceYears: 1, presentation: 'QA' },
        },
      },
    });
    trainerId = trainer.id;
    const student = await db.user.create({
      data: {
        gymId: gym.id,
        emailNormalized: 'student@renewal.example.test',
        displayName: 'Synthetic student',
        passwordHash: 'unused',
        roles: { create: { role: 'ALUMNO' } },
        studentProfile: {
          create: {
            birthDate: new Date('1999-01-01'),
            sex: 'M',
            heightCm: 175,
            heightUpdatedAt: addDays(start, 5),
            experienceLevel: 'PRINCIPIANTE',
            availableDaysPerWeek: 3,
            goals: { create: { type: 'FUERZA', startsOn: start } },
          },
        },
      },
    });
    studentId = student.id;
    await db.trainerStudentAssignment.create({
      data: {
        studentId,
        trainerId,
        startsAt: start,
        startedByUserId: trainerId,
      },
    });
    const e1 = await db.exercise.create({
      data: {
        gymId: gym.id,
        authorUserId: trainerId,
        origin: 'GIMNASIO',
        name: 'Original QA',
        instructions: 'QA',
        visualResourceUrl: '/qa.png',
        movementPattern: 'DOMINANTE_RODILLA',
        difficultyLevel: 'PRINCIPIANTE',
      },
    });
    const e2 = await db.exercise.create({
      data: {
        gymId: gym.id,
        authorUserId: trainerId,
        origin: 'GIMNASIO',
        name: 'Replacement QA',
        instructions: 'QA',
        visualResourceUrl: '/qa.png',
        movementPattern: 'DOMINANTE_CADERA',
        difficultyLevel: 'PRINCIPIANTE',
      },
    });
    exerciseId = e1.id;
    replacementId = e2.id;
    await db.gymExercise.createMany({
      data: [e1, e2].map((e) => ({
        gymId: gym.id,
        exerciseId: e.id,
        enabled: true,
        updatedByUserId: trainerId,
      })),
    });
    const template = await db.routineTemplate.create({
      data: {
        gymId: gym.id,
        authorTrainerId: trainerId,
        name: 'QA template',
        routineType: 'FUERZA',
      },
    });
    const routine = await db.routine.create({
      data: {
        studentId,
        sourceTemplateId: template.id,
        routineType: 'FUERZA',
        targetWeeklyFrequency: 1,
        state: 'VIGENTE',
        origin: 'PLANTILLA_ENTRENADOR',
        requestedAt: start,
        versions: {
          create: {
            versionNumber: 1,
            current: true,
            createdByUserId: trainerId,
            createdAt: start,
            days: {
              create: {
                position: 1,
                name: 'Original',
                dominantPattern: 'DOMINANTE_RODILLA',
                exercises: {
                  create: {
                    position: 1,
                    exerciseId,
                    sets: {
                      create: {
                        position: 1,
                        minRepetitions: 8,
                        maxRepetitions: 10,
                        suggestedLoad: 20,
                        restSeconds: 60,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      include: { versions: true },
    });
    routineId = routine.id;
    versionId = routine.versions[0]!.id;
    await db.routineReview.create({
      data: {
        routineId,
        reviewedVersionId: versionId,
        reviewerTrainerId: trainerId,
        result: 'APROBADA',
        reviewedAt: start,
      },
    });
    gateway = { dispatchGeneration: vi.fn().mockResolvedValue(undefined) };
    const clock = { now: () => now };
    renewals = new PrismaRoutineRenewalsRepository(db);
    job = new RenewRoutineCyclesUseCase(
      renewals,
      new EvaluateMeasurementCheckpointsUseCase(
        new PrismaMeasurementCheckpointsRepository(db),
        clock,
      ),
      new RequestRoutineGenerationUseCase(
        new PrismaGenerationContextRepository(db),
        gateway,
        { generate: randomUUID },
        clock,
        new PrismaRoutineGenerationsRepository(db),
      ),
      gateway,
      clock,
    );
  });

  async function deliver(
    output?: Prisma.InputJsonValue,
    targetRequestId?: string,
    attemptNumber = 1,
  ) {
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    const value = output ?? {
      schema_version: '2.0',
      outcome: 'PROPOSED',
      routine_type: 'FUERZA',
      target_weekly_frequency: 1,
      days: [
        {
          position: 1,
          name: 'Renewed',
          dominant_pattern: 'DOMINANTE_CADERA',
          exercises: [
            {
              position: 1,
              exercise_id: replacementId,
              note: null,
              sets: [
                {
                  position: 1,
                  min_repetitions: 8,
                  max_repetitions: 10,
                  suggested_load: 20,
                  rest_seconds: 60,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
      explanation: 'Cambio de composición del día revisable por el entrenador.',
      warnings: [],
    };
    await db.aiGenerationAttempt.create({
      data: {
        requestId: targetRequestId ?? cycle.requestId!,
        attemptNumber,
        state: 'COMPLETADO',
        startedAt: now,
        finishedAt: now,
        contractVersion: '2.0',
        inputHash: 'qa',
        modelVersion: 'qa',
        configurationVersion: 'qa',
        result: {
          create: {
            structuredOutput: value,
            outputHash: 'qa',
            structurallyValid: true,
            retentionUntil: addDays(now, 30),
          },
        },
      },
    });
    await db.aiGenerationRequest.update({
      where: { id: targetRequestId ?? cycle.requestId! },
      data: { state: 'COMPLETADA', finishedAt: now },
    });
    return cycle;
  }

  function regenerationUseCase() {
    const clock = { now: () => now };
    return new RegenerateProposalUseCase(
      new PrismaProposalRegenerationsRepository(db),
      new PrismaProposalsRepository(db),
      new PrismaTrainerAssignments(db),
      new RequestRoutineGenerationUseCase(
        new PrismaGenerationContextRepository(db),
        gateway,
        { generate: randomUUID },
        clock,
        new PrismaRoutineGenerationsRepository(db),
      ),
      gateway,
      clock,
    );
  }
  async function proposed() {
    await job.execute();
    await deliver();
    await job.execute();
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    return {
      proposalId: cycle.proposalId!,
      candidateRequestId: cycle.requestId!,
      trainerId,
      feedback: 'Agregá otro ejercicio del catálogo y mejorá la distribución.',
      idempotencyKey: randomUUID(),
    };
  }
  async function differentOutput() {
    const row = await db.aiGenerationResult.findFirstOrThrow();
    const output = JSON.parse(JSON.stringify(row.structuredOutput));
    output.days[0].exercises.push({
      ...output.days[0].exercises[0],
      position: 2,
      exercise_id: exerciseId,
    });
    return output;
  }

  it('trainer regeneration captures the full catalog, replaces only the pending plan, and audits its previous candidate', async () => {
    const input = await proposed();
    const useCase = regenerationUseCase();
    const row = await useCase.start(input);
    expect(row?.state).toBe('PENDIENTE');
    expect(await db.routineVersion.count()).toBe(1);
    const old = await db.proposedAdjustment.findFirstOrThrow();
    const request = await db.aiGenerationRequest.findUniqueOrThrow({
      where: { id: row!.requestId! },
    });
    const preferences =
      request.preferences as unknown as RoutineGenerationPreferences;
    expect(preferences.routine_renewal_full_catalog).toBe(true);
    expect(preferences.allowed_catalog).toHaveLength(2);
    expect(preferences.free_text).toBeNull();
    expect(preferences.generation_task).toMatchObject({
      kind: 'TRAINER_REGENERATION',
      trainer_feedback: input.feedback,
      previous_candidate: { days: expect.any(Array) },
    });
    expect(preferences.generation_task).not.toHaveProperty(
      'previous_candidate.generationSettings',
    );
    await deliver(await differentOutput(), row!.requestId!);
    expect((await useCase.status(input.proposalId, trainerId))?.state).toBe(
      'COMPLETADA',
    );
    const next = await db.proposedAdjustment.findFirstOrThrow();
    expect(next.proposedValue).not.toEqual(old.proposedValue);
    expect(next.supportingData).toEqual(old.supportingData);
    expect(
      (await db.routineVersion.findUniqueOrThrow({ where: { id: versionId } }))
        .current,
    ).toBe(true);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { operation: 'REGENERATE_ADAPTATION_PROPOSAL' },
    });
    expect(
      (audit.previousValue as { candidate: Prisma.JsonValue }).candidate,
    ).toEqual(old.proposedValue);
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      row!.requestId,
    );
  });

  it('regeneration survives reloading and two concurrent clicks create one pending request', async () => {
    const input = await proposed();
    const rows = await Promise.all([
      regenerationUseCase().start(input),
      regenerationUseCase().start({ ...input, idempotencyKey: randomUUID() }),
    ]);
    expect(rows[0]?.requestId).toBe(rows[1]?.requestId);
    expect(await db.routineProposalRegeneration.count()).toBe(1);
    expect(await db.aiGenerationRequest.count()).toBe(2);
    expect(
      (await regenerationUseCase().status(input.proposalId, trainerId))?.state,
    ).toBe('PENDIENTE');
  });

  it('recovers a process interruption between reserving the regeneration and dispatching AI', async () => {
    const input = await proposed();
    const repository = new PrismaProposalRegenerationsRepository(db);
    const reserved = await repository.reserve({ ...input, now });
    expect(reserved.regeneration.requestId).toBeNull();
    const resumed = await regenerationUseCase().status(
      input.proposalId,
      trainerId,
    );
    expect(resumed?.id).toBe(reserved.regeneration.id);
    expect(resumed?.requestId).toBeTruthy();
    expect(await db.routineProposalRegeneration.count()).toBe(1);
    expect(await db.aiGenerationRequest.count()).toBe(2);
  });

  it('the newly assigned trainer can recover a reservation made by the previous trainer', async () => {
    const input = await proposed();
    await new PrismaProposalRegenerationsRepository(db).reserve({
      ...input,
      now,
    });
    const student = await db.user.findUniqueOrThrow({
      where: { id: studentId },
    });
    const newTrainer = await db.user.create({
      data: {
        gymId: student.gymId,
        emailNormalized: 'new-trainer@renewal.example.test',
        displayName: 'New synthetic trainer',
        passwordHash: 'unused',
        roles: { create: { role: 'ENTRENADOR' } },
        trainerProfile: {
          create: { specialty: 'QA', experienceYears: 1, presentation: 'QA' },
        },
      },
    });
    await db.trainerStudentAssignment.updateMany({
      where: { studentId, endsAt: null },
      data: { endsAt: now, endedByUserId: newTrainer.id },
    });
    await db.trainerStudentAssignment.create({
      data: {
        studentId,
        trainerId: newTrainer.id,
        startsAt: now,
        startedByUserId: newTrainer.id,
      },
    });
    expect(
      (await regenerationUseCase().status(input.proposalId, newTrainer.id))
        ?.state,
    ).toBe('NO_DISPONIBLE');
    const next = await regenerationUseCase().start({
      ...input,
      trainerId: newTrainer.id,
      idempotencyKey: randomUUID(),
    });
    expect(next?.state).toBe('PENDIENTE');
    expect(next?.trainerId).toBe(newTrainer.id);
  });

  it('an AI outage leaves the previous candidate reviewable and creates one alert', async () => {
    const input = await proposed();
    const old = await db.proposedAdjustment.findFirstOrThrow();
    gateway.dispatchGeneration.mockRejectedValue(new Error('AI down'));
    const result = await regenerationUseCase().start(input);
    expect(result?.state).toBe('NO_DISPONIBLE');
    expect(
      (await db.proposedAdjustment.findFirstOrThrow()).proposedValue,
    ).toEqual(old.proposedValue);
    await regenerationUseCase().status(input.proposalId, trainerId);
    expect(
      await db.notice.count({
        where: { type: 'SENAL_DETECTADA', referenceId: input.proposalId },
      }),
    ).toBe(1);
    expect(await db.routineVersion.count()).toBe(1);
  });

  it('UNABLE and a repeated candidate preserve the previous proposal', async () => {
    const input = await proposed();
    const useCase = regenerationUseCase();
    const first = await useCase.start(input);
    await deliver(
      {
        schema_version: '2.0',
        outcome: 'UNABLE',
        reason: 'No es posible con las restricciones actuales.',
        missing_information: [],
      },
      first!.requestId!,
    );
    expect((await useCase.status(input.proposalId, trainerId))?.state).toBe(
      'NO_DISPONIBLE',
    );
    const next = await useCase.start({
      ...input,
      idempotencyKey: randomUUID(),
    });
    await deliver(undefined, next!.requestId!);
    expect(
      (await useCase.status(input.proposalId, trainerId))?.error,
    ).toContain('repitió');
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      input.candidateRequestId,
    );
  });

  it('a copied first AI attempt stays pending until a distinct retry completes', async () => {
    const input = await proposed();
    const useCase = regenerationUseCase();
    const old = await db.proposedAdjustment.findFirstOrThrow();
    const row = await useCase.start(input);
    await db.aiGenerationAttempt.create({
      data: {
        requestId: row!.requestId!,
        attemptNumber: 1,
        state: 'SALIDA_INVALIDA',
        startedAt: now,
        finishedAt: now,
        contractVersion: '2.0',
        inputHash: 'qa',
        modelVersion: 'qa',
        configurationVersion: 'qa',
        errorCode: 'routine_regeneration_candidate_unchanged',
      },
    });
    expect((await useCase.status(input.proposalId, trainerId))?.state).toBe(
      'PENDIENTE',
    );
    expect(
      (await db.proposedAdjustment.findFirstOrThrow()).proposedValue,
    ).toEqual(old.proposedValue);
    await deliver(await differentOutput(), row!.requestId!, 2);
    expect((await useCase.status(input.proposalId, trainerId))?.state).toBe(
      'COMPLETADA',
    );
    expect(
      (await db.proposedAdjustment.findFirstOrThrow()).proposedValue,
    ).not.toEqual(old.proposedValue);
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      row!.requestId,
    );
    expect(await db.routineVersion.count()).toBe(1);
  });

  it('exhausted duplicate attempts preserve the candidate and alert once without requiring different feedback', async () => {
    const input = await proposed();
    const useCase = regenerationUseCase();
    const old = await db.proposedAdjustment.findFirstOrThrow();
    const row = await useCase.start(input);
    for (const attemptNumber of [1, 2])
      await db.aiGenerationAttempt.create({
        data: {
          requestId: row!.requestId!,
          attemptNumber,
          state: 'SALIDA_INVALIDA',
          startedAt: now,
          finishedAt: now,
          contractVersion: '2.0',
          inputHash: 'qa',
          modelVersion: 'qa',
          configurationVersion: 'qa',
          errorCode: 'routine_regeneration_candidate_unchanged',
        },
      });
    await db.aiGenerationRequest.update({
      where: { id: row!.requestId! },
      data: { state: 'NO_DISPONIBLE', finishedAt: now },
    });
    const result = await useCase.status(input.proposalId, trainerId);
    expect(result?.state).toBe('NO_DISPONIBLE');
    expect(result?.error).toContain('intentos disponibles');
    expect(result?.error).not.toContain('otro comentario');
    await useCase.status(input.proposalId, trainerId);
    expect(
      (await db.proposedAdjustment.findFirstOrThrow()).proposedValue,
    ).toEqual(old.proposedValue);
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      input.candidateRequestId,
    );
    expect(
      await db.notice.count({
        where: { type: 'SENAL_DETECTADA', referenceId: input.proposalId },
      }),
    ).toBe(1);
    const next = await useCase.start({
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(next?.state).toBe('PENDIENTE');
    expect(next?.feedback).toBe(input.feedback);
  });

  it('regeneration cannot resolve an unassigned student, including status requests', async () => {
    const input = await proposed();
    const app = createApp({
      proposalsRepository: new PrismaProposalsRepository(db),
      proposalRegenerationsRepository:
        new PrismaProposalRegenerationsRepository(db),
      trainerAssignments: new PrismaTrainerAssignments(db),
    });
    await request(app)
      .post('/proposals/' + input.proposalId + '/regeneration')
      .set('x-user-id', randomUUID())
      .set('x-user-roles', 'ENTRENADOR')
      .send(input)
      .expect(400);
    const { feedback, candidateRequestId, idempotencyKey } = input;
    await request(app)
      .post('/proposals/' + input.proposalId + '/regeneration')
      .set('x-user-id', randomUUID())
      .set('x-user-roles', 'ENTRENADOR')
      .send({ feedback, candidateRequestId, idempotencyKey })
      .expect(403);
    await request(app)
      .get('/proposals/' + input.proposalId + '/regeneration')
      .set('x-user-id', randomUUID())
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);
    await request(app)
      .get('/proposals/' + input.proposalId + '/regeneration')
      .expect(401);
    await request(app)
      .get('/proposals/' + input.proposalId + '/regeneration')
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(403);
    expect(await db.routineProposalRegeneration.count()).toBe(0);
  });

  it('pending regeneration prevents approval and a completed regeneration rejects a stale review', async () => {
    const input = await proposed();
    const resolve = new ResolveProposalUseCase(
      new PrismaProposalsRepository(db),
      new PrismaTrainerAssignments(db),
      { now: () => now },
    );
    const row = await regenerationUseCase().start(input);
    await expect(
      resolve.execute({ ...input, decision: 'ACEPTADA_TOTAL' }),
    ).rejects.toMatchObject({ code: 'proposal_regeneration_pending' });
    await deliver(await differentOutput(), row!.requestId!);
    await regenerationUseCase().status(input.proposalId, trainerId);
    await expect(
      resolve.execute({ ...input, decision: 'ACEPTADA_TOTAL' }),
    ).rejects.toMatchObject({ code: 'proposal_candidate_changed' });
    await resolve.execute({
      ...input,
      candidateRequestId: row!.requestId!,
      decision: 'ACEPTADA_TOTAL',
    });
    expect(await db.routineVersion.count()).toBe(2);
  });

  it('regeneration rejects exercises disabled during inference and keeps the old candidate', async () => {
    const input = await proposed();
    const row = await regenerationUseCase().start(input);
    const old = await db.proposedAdjustment.findFirstOrThrow();
    await deliver(await differentOutput(), row!.requestId!);
    await db.gymExercise.updateMany({
      where: { exerciseId },
      data: { enabled: false, revision: { increment: 1 } },
    });
    expect(
      (await regenerationUseCase().status(input.proposalId, trainerId))?.state,
    ).toBe('NO_DISPONIBLE');
    expect(
      (await db.proposedAdjustment.findFirstOrThrow()).proposedValue,
    ).toEqual(old.proposedValue);
  });

  it('regeneration rejects references outside the captured gym catalog', async () => {
    const input = await proposed();
    const row = await regenerationUseCase().start(input);
    const output = await differentOutput();
    output.days[0].exercises[1].exercise_id = randomUUID();
    await deliver(output, row!.requestId!);
    expect(
      (await regenerationUseCase().status(input.proposalId, trainerId))?.state,
    ).toBe('NO_DISPONIBLE');
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      input.candidateRequestId,
    );
  });

  const policy = {
    minExercisesPerDay: 1,
    maxExercisesPerDay: 2,
    minWorkSetsPerExercise: 1,
    maxWorkSetsPerExercise: 1,
    minRepetitions: 8,
    maxRepetitions: 10,
    minRestSeconds: 60,
    maxRestSeconds: 90,
    warmupSetsPerExercise: 0,
  };
  async function settingsRepository() {
    const student = await db.user.findUniqueOrThrow({
      where: { id: studentId },
    });
    return {
      gymId: student.gymId,
      repository: new PrismaGenerationSettingsRepository(db),
    };
  }

  it('gym parameters are captured by automatic renewal and out-of-policy AI results cannot create proposals', async () => {
    const { gymId, repository } = await settingsRepository();
    await repository.save(gymId, trainerId, policy, 0);
    await job.execute();
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    const request = await db.aiGenerationRequest.findUniqueOrThrow({
      where: { id: cycle.requestId! },
    });
    expect(
      (request.preferences as unknown as RoutineGenerationPreferences)
        .gym_generation_settings,
    ).toEqual({ settings: policy, revision: 1 });
    const output = {
      schema_version: '2.0',
      outcome: 'PROPOSED',
      routine_type: 'FUERZA',
      target_weekly_frequency: 1,
      days: [
        {
          position: 1,
          name: 'QA',
          dominant_pattern: 'DOMINANTE_CADERA',
          exercises: [
            {
              position: 1,
              exercise_id: replacementId,
              note: null,
              sets: [
                {
                  position: 1,
                  min_repetitions: 3,
                  max_repetitions: 5,
                  suggested_load: null,
                  rest_seconds: 60,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
      explanation: 'QA',
      warnings: [],
    };
    await deliver(output);
    expect((await job.execute()).failures).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
  });

  it('trainer regeneration uses newly configured gym parameters and rejects a change made during inference', async () => {
    const input = await proposed();
    const { gymId, repository } = await settingsRepository();
    await repository.save(gymId, trainerId, policy, 0);
    const row = await regenerationUseCase().start(input);
    const request = await db.aiGenerationRequest.findUniqueOrThrow({
      where: { id: row!.requestId! },
    });
    expect(
      (request.preferences as unknown as RoutineGenerationPreferences)
        .gym_generation_settings?.revision,
    ).toBe(1);
    await deliver(await differentOutput(), row!.requestId!);
    await repository.save(
      gymId,
      trainerId,
      { ...policy, minRepetitions: 7 },
      1,
    );
    expect(
      (await regenerationUseCase().status(input.proposalId, trainerId))?.state,
    ).toBe('NO_DISPONIBLE');
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      input.candidateRequestId,
    );
  });

  it('approval reports a changed gym policy as an HTTP conflict without creating a version', async () => {
    const input = await proposed();
    const { gymId, repository } = await settingsRepository();
    await repository.save(gymId, trainerId, policy, 0);
    const app = createApp({
      proposalsRepository: new PrismaProposalsRepository(db),
      trainerAssignments: new PrismaTrainerAssignments(db),
      clock: { now: () => now },
    });
    const result = await request(app)
      .post('/proposals/' + input.proposalId + '/resolution')
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .send({
        decision: 'ACEPTADA_TOTAL',
        candidateRequestId: input.candidateRequestId,
      })
      .expect(409);
    expect(result.body.error).toBe('generation_context_changed');
    expect(await db.routineVersion.count()).toBe(1);
  });

  it('the administrator settings repository protects revisions and records an audit', async () => {
    const { gymId, repository } = await settingsRepository();
    expect(await repository.save(gymId, trainerId, policy, 0)).toEqual({
      settings: policy,
      revision: 1,
    });
    await expect(
      repository.save(gymId, trainerId, null, 0),
    ).rejects.toMatchObject({ code: 'generation_settings_conflict' });
    expect((await repository.get(gymId)).settings).toEqual(policy);
    expect(
      await db.auditLog.count({
        where: { operation: 'UPDATE_GENERATION_SETTINGS', entityId: gymId },
      }),
    ).toBe(1);
  });

  it('uses the current version review for the UI cycle even if an older version has a later review', async () => {
    const oldVersion = await db.routineVersion.create({
      data: {
        routineId,
        versionNumber: 2,
        current: false,
        createdByUserId: trainerId,
        createdAt: addDays(start, -10),
      },
    });
    await db.routineReview.create({
      data: {
        routineId,
        reviewedVersionId: oldVersion.id,
        reviewerTrainerId: trainerId,
        result: 'APROBADA',
        reviewedAt: addDays(start, 30),
      },
    });
    const active = await new PrismaRoutinesRepository(db).findActiveByStudentId(
      studentId,
    );
    expect(active?.startDate).toEqual(start);
    const students = await new PrismaStudentsRepository(
      db,
    ).findAssignedToTrainer(trainerId);
    expect(students[0]?.activeRoutine?.cycleStart).toEqual(start);
  });

  it('does not renew before day 60, including a UTC/local-date boundary', async () => {
    now = new Date('2026-11-27T02:59:59Z'); // Still November 26 at the gym.
    expect((await job.execute()).cyclesProcessed).toBe(0);
    expect(await db.routineRenewalCycle.count()).toBe(0);
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
  });

  it('captures current routine day distribution and prescribed sets for the AI renewal', async () => {
    await job.execute();
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    const evaluation = cycle.evaluation as unknown as {
      estructuraVigente?: {
        routineType: string;
        targetWeeklyFrequency: number;
        days: Array<{
          exercises: Array<{
            sets: Array<{
              minRepetitions: number;
              maxRepetitions: number;
              restSeconds: number;
              suggestedLoad: number | null;
            }>;
          }>;
        }>;
      };
    };
    const snapshot = evaluation.estructuraVigente;
    expect(snapshot?.routineType).toBeDefined();
    expect(snapshot?.targetWeeklyFrequency).toBeGreaterThan(0);
    expect(snapshot?.days.length).toBeGreaterThan(0);
    const exercises = snapshot?.days.flatMap((day) => day.exercises) ?? [];
    expect(exercises.length).toBeGreaterThan(0);
    expect(exercises.every((exercise) => exercise.sets.length > 0)).toBe(true);
    expect(exercises[0]?.sets[0]?.minRepetitions).toBeGreaterThan(0);

    const request = await db.aiGenerationRequest.findUniqueOrThrow({
      where: { id: cycle.requestId! },
    });
    const preferences = request.preferences as {
      free_text: null;
      generation_task: {
        kind: string;
        cycle: { without_updated_measurements: boolean };
      };
      routine_renewal?: boolean;
      allowed_catalog: Array<{ name: string }>;
      routine_renewal_structure?: {
        days: Array<{
          exercises: Array<{
            catalog_index: number | null;
            exercise_name: string | null;
            sets: Array<{ suggested_load: number | null }>;
          }>;
        }>;
      };
    };
    expect(preferences.free_text).toBeNull();
    expect(preferences.generation_task.kind).toBe('AUTOMATIC_RENEWAL');
    expect(preferences.generation_task.cycle.without_updated_measurements).toBe(
      true,
    );
    expect(preferences.routine_renewal).toBe(true);
    const renewalExercises =
      preferences.routine_renewal_structure?.days.flatMap(
        (day) => day.exercises,
      ) ?? [];
    expect(preferences.allowed_catalog[0]?.name).toBe('Original QA');
    expect(renewalExercises).toHaveLength(1);
    expect(renewalExercises[0]).toMatchObject({
      catalog_index: 0,
      exercise_name: 'Original QA',
      sets: expect.arrayContaining([
        expect.objectContaining({ suggested_load: 20 }),
      ]),
    });
  });

  it('backfills the routine snapshot for an existing pending cycle before dispatch', async () => {
    await db.routineRenewalCycle.create({
      data: {
        routineVersionId: versionId,
        cycleStartsOn: start,
        dueOn: addDays(start, 60),
        evaluation: {
          sinDatosActualizados: true,
          datoFaltante: 'medicion corporal posterior al inicio del ciclo',
          faltasConsecutivas: 0,
          alcanzoTopeDeFaltas: false,
          criterio: 'Renovación automática por ciclo cumplido.',
          mediciones: [],
        },
        state: 'PENDIENTE',
        createdAt: now,
      },
    });

    expect((await job.execute()).requestsDispatched).toBe(1);
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    const evaluation = cycle.evaluation as unknown as {
      estructuraVigente?: {
        days: Array<{
          exercises: Array<{ sets: Array<{ suggestedLoad: number | null }> }>;
        }>;
      };
    };
    expect(evaluation.estructuraVigente?.days.length).toBeGreaterThan(0);

    const request = await db.aiGenerationRequest.findUniqueOrThrow({
      where: { id: cycle.requestId! },
    });
    const preferences = request.preferences as {
      free_text: null;
      generation_task: {
        kind: string;
        cycle: { without_updated_measurements: boolean };
      };
      routine_renewal?: boolean;
      allowed_catalog: Array<{ name: string }>;
      routine_renewal_structure?: {
        days: Array<{
          exercises: Array<{
            catalog_index: number | null;
            exercise_name: string | null;
            sets: Array<{ suggested_load: number | null }>;
          }>;
        }>;
      };
    };
    expect(preferences.free_text).toBeNull();
    expect(preferences.generation_task.kind).toBe('AUTOMATIC_RENEWAL');
    expect(preferences.generation_task.cycle.without_updated_measurements).toBe(
      true,
    );
    expect(preferences.routine_renewal).toBe(true);
    const renewalExercises =
      preferences.routine_renewal_structure?.days.flatMap(
        (day) => day.exercises,
      ) ?? [];
    expect(preferences.allowed_catalog[0]?.name).toBe('Original QA');
    expect(renewalExercises).toHaveLength(1);
    expect(renewalExercises[0]).toMatchObject({
      catalog_index: 0,
      exercise_name: 'Original QA',
      sets: expect.arrayContaining([
        expect.objectContaining({ suggested_load: 20 }),
      ]),
    });
  });

  it('uses a new measurement, generates ESTRUCTURA automatically, and does not duplicate the proposal', async () => {
    const measurement = await db.bodyMeasurement.create({
      data: {
        studentId,
        type: 'PESO_CORPORAL',
        value: 73,
        measuredOn: addDays(start, 10),
      },
    });
    expect((await job.execute()).requestsDispatched).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0); // Durable 202 flow, no request waits for the LLM.
    const cycle = await deliver();
    expect((await job.execute()).proposalsGenerated).toBe(1);
    const proposal = await db.adaptationProposal.findFirstOrThrow({
      include: { adjustments: true },
    });
    expect(proposal.adjustments[0]).toMatchObject({
      type: 'ESTRUCTURA',
      proposedValue: {
        days: [{ exercises: [{ exerciseName: 'Replacement QA' }] }],
      },
      supportingData: {
        sinDatosActualizados: false,
        mediciones: [{ id: measurement.id, value: 73 }],
      },
    });
    const dto = toProposalReviewDto(
      (await new PrismaProposalsRepository(db).findById(proposal.id))!,
    );
    expect(dto.advertenciaDatos.sinDatosActualizados).toBe(false);
    expect((await job.execute()).proposalsGenerated).toBe(0);
    expect(await db.adaptationProposal.count()).toBe(1);
    expect(await db.routineRenewalCycle.count()).toBe(1);
    expect(
      (
        await db.routineRenewalCycle.findUniqueOrThrow({
          where: { id: cycle.id },
        })
      ).state,
    ).toBe('GENERADA');
  });

  it('rejects an AI proposal that repeats the current exercise distribution', async () => {
    await job.execute();
    await deliver({
      schema_version: '2.0',
      outcome: 'PROPOSED',
      routine_type: 'FUERZA',
      target_weekly_frequency: 1,
      days: [
        {
          position: 1,
          name: 'Copied day',
          dominant_pattern: 'DOMINANTE_RODILLA',
          exercises: [
            {
              position: 1,
              exercise_id: exerciseId,
              note: null,
              sets: [
                {
                  position: 1,
                  min_repetitions: 8,
                  max_repetitions: 10,
                  suggested_load: 20,
                  rest_seconds: 60,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
      explanation: 'Copy of the existing routine.',
      warnings: [],
    });

    expect((await job.execute()).failures).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
    expect((await db.routineRenewalCycle.findFirstOrThrow()).state).toBe(
      'NO_DISPONIBLE',
    );
    expect(await db.notice.count({ where: { type: 'SENAL_DETECTADA' } })).toBe(
      1,
    );
    expect((await db.notice.findFirstOrThrow()).text).toContain(
      'No se generó la rutina de renovación ESTRUCTURA',
    );
  });

  it('generates without measurements, declares missing data and criterion, and keeps that evidence after a later measurement', async () => {
    await job.execute();
    await deliver();
    await job.execute();
    const proposal = await db.adaptationProposal.findFirstOrThrow({
      include: { adjustments: true },
    });
    expect(proposal.adjustments[0]?.criterion).toContain('ciclo cumplido');
    expect(proposal.adjustments[0]?.supportingData).toMatchObject({
      sinDatosActualizados: true,
      datoFaltante: 'medicion corporal posterior al inicio del ciclo',
      faltasConsecutivas: 1,
    });
    await db.bodyMeasurement.create({
      data: {
        studentId,
        type: 'PESO_CORPORAL',
        value: 74,
        measuredOn: addDays(now, 1),
      },
    });
    const record = await new PrismaProposalsRepository(db).findById(
      proposal.id,
    );
    expect(toProposalReviewDto(record!).advertenciaDatos).toMatchObject({
      sinDatosActualizados: true,
      faltasConsecutivas: 1,
    });
  });

  it('does not count a measurement on the cycle start or after its close as new cycle evidence', async () => {
    await db.bodyMeasurement.createMany({
      data: [start, addDays(now, 1)].map((measuredOn) => ({
        studentId,
        type: 'PESO_CORPORAL',
        value: 72,
        measuredOn,
      })),
    });
    await job.execute();
    expect(
      (await db.routineRenewalCycle.findFirstOrThrow()).evaluation,
    ).toMatchObject({ sinDatosActualizados: true, mediciones: [] });
  });

  it('a perimeter alone keeps the outdated-data flag under RN-130', async () => {
    await db.bodyMeasurement.create({
      data: {
        studentId,
        type: 'PERIMETRO_CINTURA',
        value: 82,
        measuredOn: addDays(start, 10),
      },
    });
    // Altura fuera de ventana: confirma que el perímetro solo no alcanza.
    await db.studentProfile.update({
      where: { userId: studentId },
      data: { heightUpdatedAt: start },
    });
    await job.execute();
    expect(
      (await db.routineRenewalCycle.findFirstOrThrow()).evaluation,
    ).toMatchObject({
      sinDatosActualizados: true,
      datoFaltante: 'medicion corporal posterior al inicio del ciclo',
      faltasConsecutivas: 1,
      mediciones: [{ type: 'PERIMETRO_CINTURA' }],
    });
  });

  it('alerts once when AI dispatch is down, creates no proposal, and recovers without student action', async () => {
    gateway.dispatchGeneration.mockRejectedValue(new Error('AI down'));
    expect((await job.execute()).failures).toBe(1);
    const first = await db.routineRenewalCycle.findFirstOrThrow();
    await job.execute();
    expect(await db.notice.count({ where: { type: 'SENAL_DETECTADA' } })).toBe(
      1,
    );
    expect(await db.adaptationProposal.count()).toBe(0);
    expect((await db.notice.findFirstOrThrow()).text).toContain(
      'No se generó la rutina',
    );
    expect(await db.studentMeasurementCheckpoint.count()).toBe(1);
    gateway.dispatchGeneration.mockResolvedValue(undefined);
    await job.execute();
    expect((await db.routineRenewalCycle.findFirstOrThrow()).requestId).toBe(
      first.requestId,
    );
    await deliver();
    expect((await job.execute()).proposalsGenerated).toBe(1);
  });

  it('does not generate when the worker exhausts attempts; it alerts and preserves the active version', async () => {
    await job.execute();
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    await db.aiGenerationRequest.update({
      where: { id: cycle.requestId! },
      data: { state: 'NO_DISPONIBLE' },
    });
    expect((await job.execute()).failures).toBe(1);
    await job.execute();
    expect(await db.adaptationProposal.count()).toBe(0);
    expect(await db.notice.count({ where: { type: 'SENAL_DETECTADA' } })).toBe(
      1,
    );
    expect(
      (await db.routineVersion.findUniqueOrThrow({ where: { id: versionId } }))
        .current,
    ).toBe(true);
  });

  it('blocks at the third consecutive miss even with AI unavailable', async () => {
    now = addDays(start, 180);
    gateway.dispatchGeneration.mockRejectedValue(new Error('AI down'));
    const result = await job.execute();
    expect(result.measurementControls).toMatchObject({
      checkpointsCreated: 3,
      blocksCreated: 1,
    });
    expect(await db.studentMeasurementBlock.count()).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
    await job.execute();
    expect(await db.studentMeasurementCheckpoint.count()).toBe(3);
    expect(await db.studentMeasurementBlock.count()).toBe(1);
  });

  it('a fulfilled control cuts the consecutive-miss streak', async () => {
    await db.bodyMeasurement.create({
      data: {
        studentId,
        type: 'PESO_CORPORAL',
        value: 73,
        measuredOn: addDays(start, 80),
      },
    });
    await db.studentProfile.update({
      where: { userId: studentId },
      data: { heightUpdatedAt: addDays(start, 80) },
    });
    now = addDays(start, 180);
    await job.execute();
    const checkpoints = await db.studentMeasurementCheckpoint.findMany({
      orderBy: { dueOn: 'asc' },
    });
    expect(checkpoints.map((c) => c.result)).toEqual([
      'FALTA',
      'CUMPLIDO',
      'FALTA',
    ]);
    expect(await db.studentMeasurementBlock.count()).toBe(0);
    expect(
      (
        await db.routineRenewalCycle.findFirstOrThrow({
          orderBy: { dueOn: 'desc' },
        })
      ).evaluation,
    ).toMatchObject({ faltasConsecutivas: 1 });
  });

  it('two concurrent jobs create one cycle and one request', async () => {
    await Promise.all([job.execute(), job.execute()]);
    expect(await db.routineRenewalCycle.count()).toBe(1);
    expect(await db.aiGenerationRequest.count()).toBe(1);
    expect(gateway.dispatchGeneration).toHaveBeenCalledTimes(1);
  });

  it('recovers an expired lease after a process stops', async () => {
    await job.execute();
    const cycle = await db.routineRenewalCycle.findFirstOrThrow();
    await db.routineRenewalCycle.update({
      where: { id: cycle.id },
      data: { leaseUntil: addDays(now, -1) },
    });
    await deliver();
    expect((await job.execute()).proposalsGenerated).toBe(1);
  });

  it('rejects an UNABLE result with an alert', async () => {
    await job.execute();
    await deliver({
      schema_version: '2.0',
      outcome: 'UNABLE',
      reason: 'Insufficient context for a safe structure',
      missing_information: ['history'],
    });
    expect((await job.execute()).failures).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
    expect(await db.notice.count({ where: { type: 'SENAL_DETECTADA' } })).toBe(
      1,
    );
  });

  it('rejects a malformed AI result without creating a proposal', async () => {
    await job.execute();
    await deliver({ schema_version: '2.0', outcome: 'PROPOSED', days: [] });
    expect((await job.execute()).failures).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
  });

  it('keeps student finalization from creating a separate routine for an automatic request', async () => {
    await job.execute();
    const cycle = await deliver();
    await expect(
      new PrismaGeneratedRoutinesRepository(db).finalize({
        requestId: cycle.requestId!,
        studentId,
        requestedByUserId: studentId,
      }),
    ).rejects.toThrow();
    expect(await db.routine.count()).toBe(1);
  });

  it('cancels a previously queued cycle when the third miss blocks the student', async () => {
    await job.execute();
    const dispatches = gateway.dispatchGeneration.mock.calls.length;
    now = addDays(start, 180);
    await job.execute();
    expect(gateway.dispatchGeneration).toHaveBeenCalledTimes(dispatches);
    expect((await db.routineRenewalCycle.findFirstOrThrow()).state).toBe(
      'OMITIDA',
    );
    expect(await db.studentMeasurementBlock.count()).toBe(1);
  });

  it('alerts the gym administrator if AI is down and there is no assigned trainer', async () => {
    const student = await db.user.findUniqueOrThrow({
      where: { id: studentId },
    });
    const admin = await db.user.create({
      data: {
        gymId: student.gymId,
        emailNormalized: 'admin@renewal.example.test',
        displayName: 'Synthetic admin',
        passwordHash: 'unused',
        roles: { create: { role: 'ADMINISTRADOR' } },
      },
    });
    await db.trainerStudentAssignment.updateMany({
      where: { studentId },
      data: { endsAt: addDays(start, 1), endedByUserId: admin.id },
    });
    gateway.dispatchGeneration.mockRejectedValue(new Error('AI down'));
    await job.execute();
    expect((await db.notice.findFirstOrThrow()).recipientUserId).toBe(admin.id);
  });

  it('does not present a candidate when enabled exercises changed during generation', async () => {
    await job.execute();
    await deliver();
    await db.gymExercise.updateMany({
      where: { exerciseId: replacementId },
      data: { enabled: false, revision: { increment: 1 } },
    });
    expect((await job.execute()).failures).toBe(1);
    expect(await db.adaptationProposal.count()).toBe(0);
  });

  it('skips generation without a reviewed active routine', async () => {
    await db.routine.update({
      where: { id: routineId },
      data: { state: 'ARCHIVADA' },
    });
    expect((await job.execute()).cyclesProcessed).toBe(0);
    expect(await db.studentMeasurementCheckpoint.count()).toBe(0);
  });

  it('the trainer can approve ESTRUCTURA, creating one new version and preserving the original', async () => {
    await job.execute();
    await deliver();
    await job.execute();
    const proposal = await db.adaptationProposal.findFirstOrThrow();
    now = addDays(now, 1); // Review may happen on the next day; evidence stays frozen.
    const useCase = new ResolveProposalUseCase(
      new PrismaProposalsRepository(db),
      new PrismaTrainerAssignments(db),
      { now: () => now },
    );
    expect(
      await useCase.execute({
        trainerId,
        proposalId: proposal.id,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).toMatchObject({ resultingVersionNumber: 2 });
    const versions = await db.routineVersion.findMany({
      where: { routineId },
      orderBy: { versionNumber: 'asc' },
      include: { days: { include: { exercises: true } } },
    });
    expect(versions).toHaveLength(2);
    expect(versions[0]?.days[0]?.exercises[0]?.exerciseId).toBe(exerciseId);
    expect(versions[1]?.days[0]?.exercises[0]?.exerciseId).toBe(replacementId);
    expect(versions.map((v) => v.current)).toEqual([false, true]);
    expect((await job.execute()).cyclesProcessed).toBe(0);
    await expect(
      useCase.execute({
        trainerId,
        proposalId: proposal.id,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow();
  });

  it('still detects a new active goal after the proposal was captured', async () => {
    await job.execute();
    await deliver();
    await job.execute();
    const proposal = await db.adaptationProposal.findFirstOrThrow();
    now = addDays(now, 1);
    await db.goal.updateMany({ where: { studentId }, data: { endsOn: now } });
    await db.goal.create({
      data: { studentId, type: 'HIPERTROFIA', startsOn: now },
    });
    const useCase = new ResolveProposalUseCase(
      new PrismaProposalsRepository(db),
      new PrismaTrainerAssignments(db),
      { now: () => now },
    );
    await expect(
      useCase.execute({
        trainerId,
        proposalId: proposal.id,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow();
    expect(await db.routineVersion.count()).toBe(1);
  });

  it('approval checks the assignment and current enabled catalog again', async () => {
    await job.execute();
    await deliver();
    await job.execute();
    const proposal = await db.adaptationProposal.findFirstOrThrow();
    await db.gymExercise.updateMany({
      where: { exerciseId: replacementId },
      data: { enabled: false },
    });
    const useCase = new ResolveProposalUseCase(
      new PrismaProposalsRepository(db),
      new PrismaTrainerAssignments(db),
      { now: () => now },
    );
    await expect(
      useCase.execute({
        trainerId,
        proposalId: proposal.id,
        decision: 'ACEPTADA_TOTAL',
      }),
    ).rejects.toThrow();
    expect(await db.routineVersion.count()).toBe(1);
    expect(
      (
        await db.adaptationProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).state,
    ).toBe('PENDIENTE');
  });

  it('the cron endpoint rejects unauthenticated calls and executes only with CRON_SECRET', async () => {
    const previous = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'renewal-qa-secret';
    try {
      const app = createApp({
        routineRenewalsRepository: renewals,
        measurementCheckpointsRepository:
          new PrismaMeasurementCheckpointsRepository(db),
        generationContextRepository: new PrismaGenerationContextRepository(db),
        routineGenerationsRepository: new PrismaRoutineGenerationsRepository(
          db,
        ),
        routineGenerationGateway: gateway,
        clock: { now: () => now },
      });
      await request(app).get('/internal/jobs/routine-renewals').expect(401);
      await request(app)
        .get('/internal/jobs/routine-renewals')
        .set('authorization', 'Bearer incorrect')
        .expect(401);
      expect(await db.routineRenewalCycle.count()).toBe(0);
      await request(app)
        .get('/internal/jobs/routine-renewals')
        .set('authorization', 'Bearer renewal-qa-secret')
        .expect(200);
      expect(await db.routineRenewalCycle.count()).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previous;
    }
  });
});
