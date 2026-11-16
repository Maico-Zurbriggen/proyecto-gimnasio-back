import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaAdaptationDemoRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-adaptation-demo.repository';
import { PrismaEvolutionDiagnosticsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-evolution-diagnostics.repository';
import { PrismaAdjustmentProposalsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-adjustment-proposals.repository';
import { PrismaProposalsRepository } from '../../src/modules/evolution/infrastructure/persistence/prisma-proposals.repository';
import { DiagnoseEvolutionUseCase } from '../../src/modules/evolution/application/use-cases/diagnose-evolution.use-case';
import { ResolveProposalUseCase } from '../../src/modules/evolution/application/use-cases/resolve-proposal.use-case';
import { ADAPTATION_DEMO_SCENARIOS } from '../../src/modules/evolution/domain/services/adaptation-demo';
import type { AdaptationDemoActor } from '../../src/modules/evolution/application/ports/adaptation-demo.repository';
import { PrismaTrainingSessionsRepository } from '../../src/modules/training-sessions/infrastructure/persistence/prisma-training-sessions.repository';
import { DemoRoutineActiveError } from '../../src/modules/training-sessions/domain/errors';

// Deliberately never use DATABASE_URL, even when a shared database is configured.
const databaseUrl = process.env.ADAPTATION_DEMO_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/gym_demo_test'
  )
    throw new Error(
      'Adaptation demo integration tests require an ephemeral local gym_demo_test database',
    );
}
const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null;
const now = new Date('2026-11-15T15:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000);
const clock = { now: () => now };
const structure = {
  versions: {
    include: { days: { include: { exercises: { include: { sets: true } } } } },
  },
} as const;

describe.skipIf(!prisma)(
  'reversible adaptation demo on PostgreSQL',
  { timeout: 30_000 },
  () => {
    const db = prisma!;
    const repository = new PrismaAdaptationDemoRepository(db);
    const diagnostics = new PrismaEvolutionDiagnosticsRepository(db);
    let actor: AdaptationDemoActor;
    let studentId: string;
    let sourceId: string;
    let sourceVersionId: string;
    let sourceHistory: string;
    let sourceStructure: string;
    let alternativeId: string;

    beforeEach(async () => {
      const gymId = randomUUID();
      studentId = randomUUID();
      actor = { trainerId: randomUUID(), gymId };
      await db.gym.create({
        data: {
          id: gymId,
          name: `Demo test ${gymId}`,
          timezone: 'America/Argentina/Buenos_Aires',
        },
      });
      for (const [id, role] of [
        [studentId, 'ALUMNO'],
        [actor.trainerId, 'ENTRENADOR'],
      ] as const)
        await db.user.create({
          data: {
            id,
            gymId,
            emailNormalized: `${id}@demo.test`,
            displayName: 'Existing fixture',
            passwordHash: 'fixture',
            roles: { create: { role } },
          },
        });
      await db.studentProfile.create({
        data: {
          userId: studentId,
          birthDate: new Date('2000-01-01'),
          sex: 'M',
          heightCm: 175,
          experienceLevel: 'INTERMEDIO',
          availableDaysPerWeek: 3,
        },
      });
      await db.trainerProfile.create({
        data: {
          userId: actor.trainerId,
          specialty: 'Fixture',
          presentation: 'Fixture',
          experienceYears: 1,
        },
      });
      await db.trainerStudentAssignment.create({
        data: {
          studentId,
          trainerId: actor.trainerId,
          startedByUserId: actor.trainerId,
          startsAt: ago(120),
        },
      });
      const exercises = [];
      for (const name of ['Existing bench', 'Existing alternative']) {
        exercises.push(
          await db.exercise.create({
            data: {
              gymId,
              authorUserId: actor.trainerId,
              name,
              instructions: 'Fixture',
              movementPattern: 'EMPUJE_HORIZONTAL',
              difficultyLevel: 'INTERMEDIO',
              origin: 'GIMNASIO',
              visualResourceUrl: 'https://example.test/exercise',
              availability: {
                create: {
                  gymId,
                  enabled: true,
                  updatedByUserId: actor.trainerId,
                },
              },
            },
          }),
        );
      }
      alternativeId = exercises[1]!.id;
      const template = await db.routineTemplate.create({
        data: {
          gymId,
          authorTrainerId: actor.trainerId,
          name: 'Existing template',
          routineType: 'HIPERTROFIA',
        },
      });
      const routine = await db.routine.create({
        data: {
          studentId,
          sourceTemplateId: template.id,
          routineType: 'HIPERTROFIA',
          targetWeeklyFrequency: 3,
          state: 'VIGENTE',
          origin: 'PLANTILLA_ENTRENADOR',
          requestedByUserId: actor.trainerId,
          requestedAt: ago(70),
          versions: {
            create: {
              versionNumber: 1,
              current: true,
              createdByUserId: actor.trainerId,
              createdAt: ago(70),
              days: {
                create: [1, 2, 3].map((position) => ({
                  position,
                  name: `Day ${position}`,
                  dominantPattern: 'EMPUJE_HORIZONTAL' as const,
                  exercises: {
                    create: {
                      exerciseId: exercises[0]!.id,
                      position: 1,
                      compatibilityState: 'COMPATIBLE' as const,
                      note: 'Keep this original note',
                      sets: {
                        create: [1, 2, 3].map((setPosition) => ({
                          position: setPosition,
                          minRepetitions: 6,
                          maxRepetitions: 10,
                          suggestedLoad: 37.5,
                          restSeconds: 90,
                          warmup: false,
                        })),
                      },
                    },
                  },
                })),
              },
            },
          },
        },
        include: structure,
      });
      sourceId = routine.id;
      sourceVersionId = routine.versions[0]!.id;
      const sessionDay = routine.versions[0]!.days[0]!;
      await db.trainingSession.create({
        data: {
          studentId,
          routineId: sourceId,
          routineVersionId: sourceVersionId,
          routineDayId: sessionDay.id,
          state: 'BLOQUEADA',
          simulated: false,
          occurredOn: new Date(ago(14).toISOString().slice(0, 10)),
          startedAt: ago(14),
          completedAt: new Date(ago(14).getTime() + 3_600_000),
          lastActivityAt: new Date(ago(14).getTime() + 3_600_000),
          snapshotComplete: true,
          dayNameSnapshot: sessionDay.name,
          dayPositionSnapshot: 1,
          versionNumberSnapshot: 1,
          timezoneSnapshot: 'America/Argentina/Buenos_Aires',
          setRecords: {
            create: [1, 2, 3].map((position) => ({
              position,
              prescribedExerciseId: exercises[0]!.id,
              performedExerciseId: exercises[0]!.id,
              prescribedExerciseName: exercises[0]!.name,
              performedExerciseName: exercises[0]!.name,
              prescribedExercisePosition: 1,
              prescribedSetPosition: position,
              prescribedRestSeconds: 90,
              prescribedNote: 'Keep this original note',
              prescribedMinRepetitions: 6,
              prescribedMaxRepetitions: 10,
              prescribedLoad: 37.5,
              performedLoad: 37.5,
              performedRepetitions: 8,
              perceivedEffort: 7,
              completed: true,
              warmup: false,
              additional: false,
            })),
          },
        },
      });
      await new DiagnoseEvolutionUseCase(diagnostics, clock).execute(studentId);
      sourceStructure = JSON.stringify(
        await db.routine.findUnique({
          where: { id: sourceId },
          include: structure,
        }),
      );
      sourceHistory = JSON.stringify(
        await db.trainingSession.findMany({
          where: { studentId, simulated: false },
          include: { setRecords: true },
        }),
      );
    });

    afterAll(async () => {
      await db.$disconnect();
    });

    async function expectOriginalRestored() {
      expect(
        JSON.stringify(
          await db.routine.findUnique({
            where: { id: sourceId },
            include: structure,
          }),
        ),
      ).toBe(sourceStructure);
      expect(
        JSON.stringify(
          await db.trainingSession.findMany({
            where: { studentId, simulated: false },
            include: { setRecords: true },
          }),
        ),
      ).toBe(sourceHistory);
      expect(
        await db.routine.count({ where: { studentId, state: 'VIGENTE' } }),
      ).toBe(1);
      expect(
        await db.adaptationDemoRun.count({
          where: { studentId, restoredAt: null },
        }),
      ).toBe(0);
      expect(
        (
          await diagnostics.findLatestForStudent(
            studentId,
            'evolution-diagnosis@',
          )
        )?.simulated,
      ).toBe(false);
    }

    it.each(ADAPTATION_DEMO_SCENARIOS)(
      '%s uses existing exercises, real rules and restores the original records',
      async (scenario) => {
        const result = await repository.prepare(
          actor,
          studentId,
          scenario,
          now,
        );
        expect(result.globalSituation).toBe(
          scenario.startsWith('ESTANCAMIENTO') ? 'ESTANCAMIENTO' : scenario,
        );
        const diagnostic = await db.evolutionDiagnostic.findUniqueOrThrow({
          where: { id: result.diagnosticId },
          include: { exerciseDiagnostics: true },
        });
        expect(diagnostic.simulated).toBe(true);
        expect(
          diagnostic.exerciseDiagnostics.every(
            (item) => item.situation === result.globalSituation,
          ),
        ).toBe(true);
        const metrics = diagnostic.exerciseDiagnostics[0]!.metrics as {
          sesionesConsideradas: number;
          variacionCargaMaxima: number;
        };
        expect(metrics.sesionesConsideradas).toBe(
          scenario === 'DATOS_INSUFICIENTES'
            ? 3
            : scenario === 'ESTANCAMIENTO_SEGUNDO'
              ? 15
              : 12,
        );
        const noProposal = [
          'PROGRESION_ADECUADA',
          'DATOS_INSUFICIENTES',
        ].includes(scenario);
        expect(result.proposalId === null).toBe(noProposal);
        if (result.proposalId) {
          const proposal = await db.adaptationProposal.findUniqueOrThrow({
            where: { id: result.proposalId },
            include: { adjustments: true },
          });
          expect(proposal.state).toBe('PENDIENTE');
          expect(
            proposal.adjustments.every(
              (item) => Boolean(item.criterion) && Boolean(item.supportingData),
            ),
          ).toBe(true);
          if (scenario === 'ESTIMULO_INSUFICIENTE')
            expect(proposal.adjustments[0]!.proposedValue).toEqual({
              carga_sugerida: 62.5,
            });
          if (scenario === 'ESTANCAMIENTO_SEGUNDO')
            expect(proposal.adjustments[0]!.proposedValue).toMatchObject({
              exercise_id: alternativeId,
            });
        }
        expect(await db.exercise.count({ where: { gymId: actor.gymId } })).toBe(
          2,
        );
        expect(
          (await diagnostics.listStudentsWithCurrentRoutine()).some(
            (student) => student.studentId === studentId,
          ),
        ).toBe(false);
        const pendingJobs = await new PrismaAdjustmentProposalsRepository(
          db,
        ).listDiagnosticIdsWithoutProposal(ago(100));
        expect(pendingJobs).not.toContain(result.diagnosticId);
        await repository.restore(actor, studentId, now);
        await expectOriginalRestored();
        if (result.proposalId)
          expect(
            (
              await db.adaptationProposal.findUniqueOrThrow({
                where: { id: result.proposalId },
              })
            ).state,
          ).toBe('INVALIDADA');
      },
    );

    it('persists different metrics for different exercises without changing the original routine', async () => {
      const sourceDay = await db.routineDay.findFirstOrThrow({
        where: { routineVersionId: sourceVersionId },
        orderBy: { position: 'asc' },
      });
      await db.routineExercise.create({
        data: {
          routineDayId: sourceDay.id,
          exerciseId: alternativeId,
          position: 2,
          compatibilityState: 'COMPATIBLE',
          sets: {
            create: [1, 2, 3].map((position) => ({
              position,
              minRepetitions: 6,
              maxRepetitions: 10,
              suggestedLoad: 30,
              restSeconds: 90,
              warmup: false,
            })),
          },
        },
      });
      sourceStructure = JSON.stringify(
        await db.routine.findUnique({
          where: { id: sourceId },
          include: structure,
        }),
      );
      const result = await repository.prepare(
        actor,
        studentId,
        'ESTANCAMIENTO_PRIMERO',
        now,
      );
      const diagnostic = await db.evolutionDiagnostic.findUniqueOrThrow({
        where: { id: result.diagnosticId },
        include: { exerciseDiagnostics: true },
      });
      expect(diagnostic.exerciseDiagnostics).toHaveLength(2);
      expect(
        diagnostic.exerciseDiagnostics.every(
          (exercise) => exercise.situation === 'ESTANCAMIENTO',
        ),
      ).toBe(true);
      expect(diagnostic.exerciseDiagnostics[0]!.metrics).not.toEqual(
        diagnostic.exerciseDiagnostics[1]!.metrics,
      );
      await repository.restore(actor, studentId, now);
      await expectOriginalRestored();
    });

    it('replaces an older preparation once and then reuses the current preparation', async () => {
      const old = await repository.prepare(
        actor,
        studentId,
        'ESTANCAMIENTO_PRIMERO',
        now,
      );
      await db.adaptationDemoRun.update({
        where: { id: old.runId },
        data: { result: { ...old, preparationVersion: 1 } },
      });
      const updated = await repository.prepare(
        actor,
        studentId,
        'ESTANCAMIENTO_PRIMERO',
        now,
      );
      expect(updated.runId).not.toBe(old.runId);
      expect(updated.reused).toBe(false);
      expect(
        (
          await db.adaptationDemoRun.findUniqueOrThrow({
            where: { id: old.runId },
          })
        ).restoredAt,
      ).not.toBeNull();
      expect(
        (
          await repository.prepare(
            actor,
            studentId,
            'ESTANCAMIENTO_PRIMERO',
            now,
          )
        ).runId,
      ).toBe(updated.runId);
      await repository.restore(actor, studentId, now);
      await expectOriginalRestored();
    });

    it('serializes simultaneous clicks and reuses the diagnosis when recalculated', async () => {
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          repository.prepare(actor, studentId, 'ESTIMULO_INSUFICIENTE', now),
        ),
      );
      expect(new Set(results.map((result) => result.runId)).size).toBe(1);
      expect(results.filter((result) => result.reused)).toHaveLength(2);
      const recalculated = await new DiagnoseEvolutionUseCase(
        diagnostics,
        clock,
      ).execute(studentId);
      expect(recalculated.diagnosticId).toBe(results[0]!.diagnosticId);
      expect(
        await db.evolutionDiagnostic.count({
          where: { studentId, simulated: true },
        }),
      ).toBe(1);
    });

    it.each(['ACEPTADA_TOTAL', 'RECHAZADA'] as const)(
      'restores after %s and can prepare the same case again',
      async (decision) => {
        const result = await repository.prepare(
          actor,
          studentId,
          'ESTIMULO_INSUFICIENTE',
          now,
        );
        const resolve = new ResolveProposalUseCase(
          new PrismaProposalsRepository(db),
          { isActive: async () => true },
          clock,
        );
        await resolve.execute({
          trainerId: actor.trainerId,
          proposalId: result.proposalId!,
          decision,
          ...(decision === 'RECHAZADA' ? { reason: 'Demo rejection' } : {}),
        });
        const demoRoutine = await db.routine.findUniqueOrThrow({
          where: { demoRunId: result.runId },
          include: structure,
        });
        expect(demoRoutine.versions).toHaveLength(
          decision === 'ACEPTADA_TOTAL' ? 2 : 1,
        );
        if (decision === 'ACEPTADA_TOTAL') {
          const current = demoRoutine.versions.find(
            (version) => version.current,
          )!;
          expect(
            Number(current.days[0]!.exercises[0]!.sets[0]!.suggestedLoad),
          ).toBe(62.5);
        }
        expect(
          (await repository.list(actor))[0]?.activeRun?.proposalState,
        ).toBe(decision);
        const repeated = await repository.prepare(
          actor,
          studentId,
          'ESTIMULO_INSUFICIENTE',
          now,
        );
        expect(repeated.runId).not.toBe(result.runId);
        expect(repeated.reused).toBe(false);
        await repository.restore(actor, studentId, now);
        expect(await repository.restore(actor, studentId, now)).toEqual({
          restored: false,
        });
        await expectOriginalRestored();
      },
    );

    it('rolls back a failed case switch, preserving the existing pending proposal', async () => {
      const result = await repository.prepare(
        actor,
        studentId,
        'ESTIMULO_INSUFICIENTE',
        now,
      );
      await db.gymExercise.update({
        where: {
          gymId_exerciseId: { gymId: actor.gymId, exerciseId: alternativeId },
        },
        data: { enabled: false },
      });
      const countBefore = await db.evolutionDiagnostic.count({
        where: { studentId },
      });
      await expect(
        repository.prepare(actor, studentId, 'ESTANCAMIENTO_SEGUNDO', now),
      ).rejects.toMatchObject({ code: 'demo_alternative_required' });
      expect(await db.evolutionDiagnostic.count({ where: { studentId } })).toBe(
        countBefore,
      );
      expect((await repository.list(actor))[0]?.activeRun?.runId).toBe(
        result.runId,
      );
      expect(
        (
          await db.adaptationProposal.findUniqueOrThrow({
            where: { id: result.proposalId! },
          })
        ).state,
      ).toBe('PENDIENTE');
      await repository.restore(actor, studentId, now);
      await expectOriginalRestored();
    });

    it('revalidates assignment and gym under the database lock', async () => {
      const otherGym = await db.gym.create({
        data: { name: `Other gym ${randomUUID()}`, timezone: 'UTC' },
      });
      await expect(
        repository.prepare(
          { ...actor, gymId: otherGym.id },
          studentId,
          'SOBREEXIGENCIA',
          now,
        ),
      ).rejects.toMatchObject({ code: 'forbidden_not_assigned' });
      await expect(
        repository.restore(
          { ...actor, trainerId: randomUUID() },
          studentId,
          now,
        ),
      ).rejects.toMatchObject({ code: 'forbidden_not_assigned' });
      await expectOriginalRestored();
    });

    it('prevents real training while prepared, and permits it after restoration', async () => {
      await repository.prepare(actor, studentId, 'SOBREEXIGENCIA', now);
      const sessions = new PrismaTrainingSessionsRepository(db);
      const command = {
        actor: {
          id: studentId,
          gymId: actor.gymId,
          roles: ['ALUMNO' as const],
        },
        studentId,
        now,
      };
      await expect(sessions.start(command)).rejects.toBeInstanceOf(
        DemoRoutineActiveError,
      );
      await repository.restore(actor, studentId, now);
      const started = await sessions.start(command);
      expect(started.routineId).toBe(sourceId);
      expect(started.simulated).toBe(false);
    });
  },
);
