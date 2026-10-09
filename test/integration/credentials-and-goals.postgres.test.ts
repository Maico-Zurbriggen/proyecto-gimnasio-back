import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthUser } from '../../src/shared/types/auth';
import { PrismaPasswordRecoveryRepository } from '../../src/modules/auth/infrastructure/persistence/prisma-password-recovery.repository';
import { PrismaAuthRepository } from '../../src/modules/auth/infrastructure/persistence/prisma-auth.repository';
import { PrismaGoalsRepository } from '../../src/modules/goals/infrastructure/persistence/prisma-goals.repository';
import { PrismaGenerationContextRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { PrismaPrescriptionsRepository } from '../../src/modules/prescriptions/infrastructure/persistence/prisma-prescriptions.repository';
import { GoalMismatchConfirmationError } from '../../src/modules/prescriptions/domain/errors/prescription-errors';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';

// Exclusivamente base efímera local: nunca usa DATABASE_URL ni Neon por defecto.
const databaseUrl = process.env.HU09_HU10_TEST_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !['/gym_ci', '/gym_migrations', '/gym_hu09_hu10'].includes(url.pathname)
  )
    throw new Error(
      'HU09/HU10 integration tests require an ephemeral local database',
    );
}
const prisma = databaseUrl
  ? new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  : null;

describe.skipIf(!prisma)('HU09/HU10 PostgreSQL invariants', () => {
  const db = prisma!;
  const recovery = new PrismaPasswordRecoveryRepository(db);
  const goals = new PrismaGoalsRepository(db);
  let gymId: string;
  let studentId: string;
  let trainerId: string;
  let otherTrainerId: string;
  let email: string;
  let actor: AuthUser;
  let trainer: AuthUser;
  let originHash: string;
  beforeEach(async () => {
    gymId = randomUUID();
    studentId = randomUUID();
    trainerId = randomUUID();
    otherTrainerId = randomUUID();
    email = `${studentId}@gimnasio.test`;
    originHash = hashearToken(randomUUID());
    await db.gym.create({
      data: {
        id: gymId,
        name: 'HU09/HU10 test',
        timezone: 'America/Argentina/Buenos_Aires',
      },
    });
    for (const id of [studentId, trainerId, otherTrainerId])
      await db.user.create({
        data: {
          id,
          gymId,
          emailNormalized: id === studentId ? email : `${id}@gimnasio.test`,
          displayName: 'Fixture',
          passwordHash: 'old-hash',
          roles: {
            create: [{ role: id === studentId ? 'ALUMNO' : 'ENTRENADOR' }],
          },
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
    for (const userId of [trainerId, otherTrainerId])
      await db.trainerProfile.create({
        data: {
          userId,
          specialty: 'Test',
          experienceYears: 1,
          presentation: 'Test',
        },
      });
    actor = { id: studentId, gymId, roles: ['ALUMNO'] };
    trainer = { id: trainerId, gymId, roles: ['ENTRENADOR'] };
  });
  afterEach(async () => {
    // Auditoría append-only: ese fixture se conserva hasta destruir la base
    // efímera. No se deshabilitan triggers ni se altera el historial del dominio.
    if (
      await db.auditLog.count({
        where: { actorUserId: { in: [studentId, trainerId, otherTrainerId] } },
      })
    )
      return;
    // Sólo los UUID creados por esta prueba, aun cuando se ejecute con otros tests.
    await db.$transaction(async (tx) => {
      await tx.notice.deleteMany({
        where: {
          recipientUserId: { in: [studentId, trainerId, otherTrainerId] },
        },
      });
      await tx.proposedAdjustment.deleteMany({
        where: { proposal: { studentId } },
      });
      await tx.adaptationProposal.deleteMany({ where: { studentId } });
      await tx.evolutionDiagnostic.deleteMany({ where: { studentId } });
      await tx.routineReview.deleteMany({ where: { routine: { studentId } } });
      await tx.routineVersion.deleteMany({ where: { routine: { studentId } } });
      await tx.routine.deleteMany({ where: { studentId } });
      await tx.routineTemplate.deleteMany({ where: { gymId } });
      await tx.goal.deleteMany({ where: { studentId } });
      await tx.trainerStudentAssignment.deleteMany({ where: { studentId } });
      await tx.studentProfile.deleteMany({ where: { userId: studentId } });
      await tx.trainerProfile.deleteMany({
        where: { userId: { in: [trainerId, otherTrainerId] } },
      });
      await tx.user.deleteMany({ where: { gymId } });
      await tx.gym.deleteMany({ where: { id: gymId } });
      await tx.passwordRecoveryLimit.deleteMany({ where: { originHash } });
    });
  });
  afterAll(async () => {
    await db.$disconnect();
  });
  const issue = (token: string, origin: string = originHash, at = new Date()) =>
    recovery.issue({
      email,
      originHash: origin,
      tokenHash: hashearToken(token),
      now: at,
      expiresAt: new Date(at.getTime() + 7200000),
    });
  async function assign() {
    return db.trainerStudentAssignment.create({
      data: {
        studentId,
        trainerId,
        startedByUserId: trainerId,
        startsAt: new Date(Date.now() - 1000),
      },
    });
  }
  async function session() {
    return db.authSession.create({
      data: {
        userId: studentId,
        tokenHash: hashearToken(randomUUID()),
        expiresAt: new Date(Date.now() + 3600000),
      },
    });
  }
  async function routine(state: 'VIGENTE' | 'PROPUESTA' = 'VIGENTE') {
    const template = await db.routineTemplate.create({
      data: {
        gymId,
        authorTrainerId: trainerId,
        name: 'Fixture',
        routineType: 'FUERZA',
      },
    });
    return db.routine.create({
      data: {
        studentId,
        routineType: 'FUERZA',
        targetWeeklyFrequency: 3,
        state,
        origin: 'PLANTILLA_ENTRENADOR',
        sourceTemplateId: template.id,
        requestedByUserId: trainerId,
        versions: {
          create: {
            versionNumber: 1,
            current: state === 'VIGENTE',
            createdByUserId: trainerId,
          },
        },
      },
      include: { versions: true },
    });
  }

  it('preserves the partial unique index and timestamp types after applying the migration chain', async () => {
    const indexes = await db.$queryRaw<
      Array<{ indexdef: string }>
    >`SELECT indexdef FROM pg_indexes WHERE schemaname = 'app' AND indexname = 'goals_one_current_per_student_key'`;
    expect(indexes[0]!.indexdef).toContain('UNIQUE');
    expect(indexes[0]!.indexdef).toContain('ends_on IS NULL');
    const columns = await db.$queryRaw<
      Array<{ data_type: string }>
    >`SELECT data_type FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'goals' AND column_name IN ('starts_on', 'ends_on')`;
    expect(columns.map((column) => column.data_type)).toEqual([
      'timestamp with time zone',
      'timestamp with time zone',
    ]);
  });
  it('invalidates previous tokens and sends no link to suspended accounts', async () => {
    expect((await issue('first')).recipients).toEqual([email]);
    await issue('second');
    expect(
      await recovery.reset(hashearToken('first'), 'new-hash', new Date()),
    ).toBe(false);
    expect(
      (
        await db.passwordResetToken.findUniqueOrThrow({
          where: { tokenHash: hashearToken('second') },
        })
      ).usedAt,
    ).toBeNull();
    await db.user.update({
      where: { id: studentId },
      data: { state: 'SUSPENDIDO' },
    });
    const suspended = await recovery.issue({
      email,
      originHash,
      tokenHash: hashearToken('not-issued'),
      now: new Date(Date.now() + 86400000),
      expiresAt: new Date(Date.now() + 86400000 + 7200000),
    });
    expect(suspended.recipients).toEqual([]);
    expect(
      await recovery.reset(hashearToken('second'), 'new-hash', new Date()),
    ).toBe(false);
  });
  it('allows only two concurrent requests per origin and UTC day, including unknown emails', async () => {
    const now = new Date();
    const results = await Promise.all(
      ['a', 'b', 'c'].map((token) =>
        recovery.issue({
          email: 'absent@gimnasio.test',
          originHash,
          tokenHash: hashearToken(token),
          now,
          expiresAt: new Date(now.getTime() + 7200000),
        }),
      ),
    );
    expect(results.filter((result) => result.limited)).toHaveLength(1);
    expect((await issue('blocked')).limited).toBe(true);
    expect(
      (await issue('tomorrow', originHash, new Date(now.getTime() + 86400000)))
        .limited,
    ).toBe(false);
  });
  it('consumes once under concurrency, immediately replaces credentials and revokes every prior session', async () => {
    const before = await db.user.findUniqueOrThrow({
      where: { id: studentId },
      include: { roles: true },
    });
    const s1 = await session();
    const s2 = await session();
    await issue('token');
    const results = await Promise.all([
      recovery.reset(hashearToken('token'), 'new-hash', new Date()),
      recovery.reset(hashearToken('token'), 'another-hash', new Date()),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const after = await db.user.findUniqueOrThrow({
      where: { id: studentId },
      include: { roles: true },
    });
    expect(after.passwordHash).not.toBe('old-hash');
    expect(after.roles).toEqual(before.roles);
    expect(after.gymId).toBe(before.gymId);
    expect(
      await db.authSession.count({
        where: { id: { in: [s1.id, s2.id] }, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await recovery.reset(hashearToken('token'), 'third-hash', new Date()),
    ).toBe(false);
    const auth = new PrismaAuthRepository(db);
    await expect(
      auth.createSession({
        userId: studentId,
        tokenHash: hashearToken('late-login'),
        expectedPasswordHash: 'old-hash',
        expiresAt: new Date(Date.now() + 60000),
      }),
    ).rejects.toThrow();
  });
  it('evaluates expiration after obtaining the user lock and preserves the current authenticated session only', async () => {
    const current = await session();
    const other = await session();
    await issue('expires');
    await db.passwordResetToken.update({
      where: { tokenHash: hashearToken('expires') },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect(
      await recovery.reset(
        hashearToken('expires'),
        'bad-hash',
        new Date(Date.now() - 7200000),
      ),
    ).toBe(false);
    expect(
      await recovery.change(studentId, current.id, 'new-hash', new Date()),
    ).toBe(true);
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: current.id } }))
        .revokedAt,
    ).toBeNull();
    expect(
      (await db.authSession.findUniqueOrThrow({ where: { id: other.id } }))
        .revokedAt,
    ).not.toBeNull();
    expect(
      await recovery.change(studentId, other.id, 'bad-hash', new Date()),
    ).toBe(false);
  });
  it('serializes simultaneous declarations, maintains one current goal and preserves the complete history', async () => {
    const empty = await goals.read(actor, studentId);
    expect(empty!.current).toBeNull();
    expect(empty!.context.missing).toContain('objetivo');
    const initial = await goals.declare(actor, 'FUERZA');
    expect(initial!.goal.endsOn).toBeNull();
    const unchanged = await Promise.all([
      goals.declare(actor, 'FUERZA'),
      goals.declare(actor, 'FUERZA'),
    ]);
    expect(unchanged.every((result) => !result!.changed)).toBe(true);
    expect(await db.goal.count({ where: { studentId } })).toBe(1);
    await Promise.all([
      goals.declare(actor, 'HIPERTROFIA'),
      goals.declare(actor, 'RESISTENCIA_MUSCULAR'),
    ]);
    const snapshot = await goals.read(actor, studentId);
    expect(snapshot!.history).toHaveLength(3);
    expect(
      snapshot!.history.filter((goal) => goal.endsOn === null),
    ).toHaveLength(1);
    for (let i = 0; i < 2; i++)
      expect(snapshot!.history[i]!.endsOn).toEqual(
        snapshot!.history[i + 1]!.startsOn,
      );
    const boundary = snapshot!.history[1]!.startsOn.toISOString();
    expect((await goals.read(actor, studentId, boundary))!.atDate!.id).toBe(
      snapshot!.history[1]!.id,
    );
    await expect(
      db.goal.create({
        data: { studentId, type: 'FUERZA', startsOn: new Date() },
      }),
    ).rejects.toThrow();
  });
  it('uses local gym dates for historical lookup and includes only the objective valid at the requested instant in generation context', async () => {
    await db.goal.create({
      data: {
        studentId,
        type: 'FUERZA',
        startsOn: new Date('2026-01-01T03:00:00Z'),
        endsOn: new Date('2026-06-01T03:00:00Z'),
      },
    });
    await db.goal.create({
      data: {
        studentId,
        type: 'HIPERTROFIA',
        startsOn: new Date('2026-06-01T03:00:00Z'),
      },
    });
    expect(
      (await goals.read(actor, studentId, '2026-06-01'))!.atDate!.type,
    ).toBe('HIPERTROFIA');
    expect(
      (await goals.read(actor, studentId, '2026-06-01T02:59:59Z'))!.atDate!
        .type,
    ).toBe('FUERZA');
    expect(
      (await goals.read(actor, studentId, '2025-12-31'))!.atDate,
    ).toBeNull();
    const context = await new PrismaGenerationContextRepository(
      db,
    ).getStudentContext(studentId, new Date('2026-06-01T03:00:00Z'));
    expect(context!.minimizedContext.objetivosActivos).toEqual(['hipertrofia']);
  });
  it('enforces current trainer assignment and gym isolation, and loses access as soon as assignment ends', async () => {
    expect(await goals.read(trainer, studentId)).toBeNull();
    const assignment = await assign();
    expect(await goals.read(trainer, studentId)).not.toBeNull();
    expect(
      await goals.read({ ...trainer, gymId: randomUUID() }, studentId),
    ).toBeNull();
    expect(
      await goals.read(
        { id: otherTrainerId, gymId, roles: ['ADMINISTRADOR'] },
        studentId,
      ),
    ).toBeNull();
    await db.trainerStudentAssignment.update({
      where: { id: assignment.id },
      data: { endsAt: new Date(), endedByUserId: trainerId },
    });
    expect(await goals.read(trainer, studentId)).toBeNull();
  });

  it('resolves local dates across a daylight-saving boundary in the gym timezone', async () => {
    await db.gym.update({
      where: { id: gymId },
      data: { timezone: 'America/New_York' },
    });
    await db.goal.create({
      data: {
        studentId,
        type: 'FUERZA',
        startsOn: new Date('2026-03-08T05:00:00Z'),
        endsOn: new Date('2026-03-09T04:00:00Z'),
      },
    });
    await db.goal.create({
      data: {
        studentId,
        type: 'HIPERTROFIA',
        startsOn: new Date('2026-03-09T04:00:00Z'),
      },
    });
    expect(
      (await goals.read(actor, studentId, '2026-03-08'))!.atDate!.type,
    ).toBe('FUERZA');
    expect(
      (await goals.read(actor, studentId, '2026-03-09'))!.atDate!.type,
    ).toBe('HIPERTROFIA');
  });

  it('keeps reevaluation proposals blocked when the trainer assignment has ended', async () => {
    const assignment = await assign();
    await goals.declare(actor, 'FUERZA');
    await routine();
    await db.trainerStudentAssignment.update({
      where: { id: assignment.id },
      data: { endsAt: new Date(), endedByUserId: trainerId },
    });
    await goals.declare(actor, 'HIPERTROFIA');
    expect(
      (await db.adaptationProposal.findFirstOrThrow({ where: { studentId } }))
        .state,
    ).toBe('BLOQUEADA');
    expect(await goals.read(trainer, studentId)).toBeNull();
  });
  it('reevaluates once per actual change, proposes the type and schemes, and requires confirmation on routine review', async () => {
    await assign();
    await goals.declare(actor, 'FUERZA');
    const active = await routine();
    await goals.declare(actor, 'HIPERTROFIA');
    const proposal = await db.adaptationProposal.findFirstOrThrow({
      where: { studentId, state: 'PENDIENTE' },
      include: { adjustments: true },
    });
    expect(proposal.adjustments[0]!.proposedValue).toMatchObject({
      routine_type: 'HIPERTROFIA',
      scheme: { minRepetitions: 6, maxRepetitions: 12 },
    });
    expect(
      (await db.routine.findUniqueOrThrow({ where: { id: active.id } }))
        .routineType,
    ).toBe('FUERZA');
    await goals.declare(actor, 'HIPERTROFIA');
    expect(
      await db.auditLog.count({
        where: {
          actorUserId: studentId,
          operation: 'REEVALUACION_CAMBIO_OBJETIVO',
        },
      }),
    ).toBe(1);
    const proposed = await routine('PROPUESTA');
    const prescriptions = new PrismaPrescriptionsRepository(db);
    const review = {
      routineId: proposed.id,
      versionId: proposed.versions[0]!.id,
      reviewerTrainerId: trainerId,
      result: 'APROBADA' as const,
      observation: null,
      previousActiveRoutineId: active.id,
    };
    await expect(prescriptions.review(review)).rejects.toBeInstanceOf(
      GoalMismatchConfirmationError,
    );
    await prescriptions.review({ ...review, confirmGoalMismatch: true });
    expect(
      (await db.routine.findUniqueOrThrow({ where: { id: proposed.id } }))
        .state,
    ).toBe('VIGENTE');
    await goals.declare(actor, 'RESISTENCIA_MUSCULAR');
    expect(
      (
        await db.adaptationProposal.findUniqueOrThrow({
          where: { id: proposal.id },
        })
      ).state,
    ).toBe('INVALIDADA');
  });
});
