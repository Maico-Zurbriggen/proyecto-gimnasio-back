import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  CurrentVersionSnapshot,
  ProposalRecord,
  ProposalsRepository,
} from '../../src/modules/evolution/application/ports/proposals.repository';
import type { TrainerAssignments } from '../../src/modules/students/application/ports/trainer-assignments.port';

const TRAINER = '33333333-3333-4333-a333-333333333333';
const STUDENT = '11111111-1111-4111-a111-111111111111';
const PROPOSAL = '66666666-6666-4666-a666-666666666666';
const ROUTINE = '60000000-0000-4000-8000-000000000005';
const ADJ_LOAD = '67000000-0000-4000-8000-000000000001';
const ADJ_SCHEME = '67000000-0000-4000-8000-000000000002';
const now = new Date('2026-09-15T12:00:00Z');
const clock = { now: () => now };
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function proposal(overrides: Partial<ProposalRecord> = {}): ProposalRecord {
  return {
    id: PROPOSAL,
    state: 'PENDIENTE',
    createdAt: daysAgo(1),
    resolvedAt: null,
    resolutionReason: null,
    student: { id: STUDENT, displayName: 'Sofía Medina' },
    diagnostic: {
      periodStart: daysAgo(20),
      periodEnd: daysAgo(1),
      globalSituation: 'ESTANCAMIENTO',
      adherence: 62.5,
    },
    routine: {
      id: ROUTINE,
      routineType: 'FUERZA',
      cycleStart: daysAgo(20),
      currentVersionNumber: 1,
    },
    adjustments: [
      {
        id: ADJ_LOAD,
        type: 'CARGA',
        routineExerciseId: 're-sentadilla',
        exerciseName: 'Sentadilla con barra',
        criterion: 'Estancamiento',
        previousValue: { carga_sugerida: 60 },
        proposedValue: { carga_sugerida: 62.5 },
        supportingData: { sesiones: 6 },
        state: 'PENDIENTE',
      },
      {
        id: ADJ_SCHEME,
        type: 'ESQUEMA',
        routineExerciseId: 're-sentadilla',
        exerciseName: 'Sentadilla con barra',
        criterion: 'Tope del rango',
        previousValue: { min_repetitions: 3, max_repetitions: 6 },
        proposedValue: { min_repetitions: 4, max_repetitions: 6 },
        supportingData: {},
        state: 'PENDIENTE',
      },
    ],
    // La única medición es anterior al inicio del ciclo: sin datos actualizados.
    measurementDates: [daysAgo(40)],
    previousProposalDates: [],
    ...overrides,
  };
}

const currentVersion: CurrentVersionSnapshot = {
  routineId: ROUTINE,
  days: [
    {
      position: 1,
      name: 'Día A · Pierna',
      dominantPattern: 'DOMINANTE_RODILLA',
      exercises: [
        {
          sourceId: 're-sentadilla',
          exerciseId: 'e-sentadilla',
          position: 1,
          note: null,
          compatibilityState: 'COMPATIBLE',
          compatibilityReason: null,
          sets: [1, 2, 3].map((position) => ({
            position,
            minRepetitions: 3,
            maxRepetitions: 6,
            suggestedLoad: 60,
            restSeconds: 180,
            warmup: false,
          })),
        },
      ],
    },
  ],
};

function buildApp({
  assigned = true,
  record = proposal() as ProposalRecord | null,
  resolved = true,
} = {}) {
  const proposalsRepository: ProposalsRepository = {
    findById: vi.fn().mockResolvedValue(record),
    findPendingForTrainer: vi.fn().mockResolvedValue(record ? [record] : []),
    findCurrentVersion: vi.fn().mockResolvedValue(currentVersion),
    persistResolution: vi.fn().mockResolvedValue({
      resolved,
      resultingVersionNumber: resolved ? 2 : null,
    }),
  };
  const trainerAssignments: TrainerAssignments = {
    isActive: vi.fn().mockResolvedValue(assigned),
  };
  const app = createApp({ proposalsRepository, trainerAssignments, clock });
  return { app, proposalsRepository };
}

const asTrainer = (test: request.Test) =>
  test.set('x-user-id', TRAINER).set('x-user-roles', 'ENTRENADOR');

describe('Proposals API - HU04', () => {
  it('Esc. 2: the review payload flags a proposal generated without updated data', async () => {
    const { app } = buildApp();

    const response = await asTrainer(
      request(app).get(`/proposals/${PROPOSAL}`),
    ).expect(200);

    expect(response.body).toMatchObject({
      id: PROPOSAL,
      state: 'PENDIENTE',
      student: { id: STUDENT, displayName: 'Sofía Medina' },
      routine: { id: ROUTINE, routineType: 'FUERZA', currentVersionNumber: 1 },
      advertenciaDatos: {
        sinDatosActualizados: true,
        datoFaltante: 'medicion corporal posterior al inicio del ciclo',
        faltasConsecutivas: 1,
        alcanzoTopeDeFaltas: false,
      },
    });
    expect(response.body.adjustments).toHaveLength(2);
  });

  it('Esc. 1: no warning when there is a measurement after the cycle start', async () => {
    const { app } = buildApp({
      record: proposal({ measurementDates: [daysAgo(5)] }),
    });

    const response = await asTrainer(
      request(app).get(`/proposals/${PROPOSAL}`),
    ).expect(200);

    expect(response.body.advertenciaDatos.sinDatosActualizados).toBe(false);
  });

  it('lists pending proposals of the trainer', async () => {
    const { app, proposalsRepository } = buildApp();

    const response = await asTrainer(
      request(app).get('/trainers/me/proposals'),
    ).expect(200);

    expect(proposalsRepository.findPendingForTrainer).toHaveBeenCalledWith(
      TRAINER,
    );
    expect(response.body[0]).toMatchObject({
      id: PROPOSAL,
      adjustmentsCount: 2,
      advertenciaDatos: { sinDatosActualizados: true },
    });
  });

  it('returns 403 without an active assignment, 404 for an unknown proposal and 400 for a bad id', async () => {
    await asTrainer(
      request(buildApp({ assigned: false }).app).get(`/proposals/${PROPOSAL}`),
    ).expect(403, { error: 'forbidden_not_assigned' });
    await asTrainer(
      request(buildApp({ record: null }).app).get(`/proposals/${PROPOSAL}`),
    ).expect(404, { error: 'proposal_not_found' });
    await asTrainer(
      request(buildApp().app).get('/proposals/no-es-uuid'),
    ).expect(400);
  });

  it('Esc. 3: total acceptance (aprobación) creates a new version with all adjustments and resets the cycle without a second review', async () => {
    const { app, proposalsRepository } = buildApp();

    const response = await asTrainer(
      request(app).post(`/proposals/${PROPOSAL}/resolution`),
    )
      .send({ decision: 'ACEPTADA_TOTAL' })
      .expect(200);

    expect(response.body).toEqual({
      proposalId: PROPOSAL,
      state: 'ACEPTADA_TOTAL',
      resultingVersionNumber: 2,
    });

    const command = vi.mocked(proposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.plan).toMatchObject({
      state: 'ACEPTADA_TOTAL',
      acceptedIds: [ADJ_LOAD, ADJ_SCHEME],
      rejectedIds: [],
      // RN-35a: la resolución es la revisión y no se pide segunda revisión
      reviewResult: 'APROBADA',
    });
    expect(command.routineId).toBe(ROUTINE);
    expect(command.resolvedAt).toEqual(now);

    const sets = command.newVersionDays![0]!.exercises[0]!.sets;
    expect(sets.every((set) => set.suggestedLoad === 62.5)).toBe(true);
    expect(
      sets.every((set) => set.minRepetitions === 4 && set.maxRepetitions === 6),
    ).toBe(true);
    // Invariante RF-092: versión de origen conservada íntegra
    expect(currentVersion.days[0]!.exercises[0]!.sets[0]!.suggestedLoad).toBe(
      60,
    );
    expect(currentVersion.days[0]!.exercises[0]!.sets[0]!.minRepetitions).toBe(
      3,
    );
  });

  it('Esc. 3: partial acceptance creates a new version with only the accepted adjustments', async () => {
    const { app, proposalsRepository } = buildApp();

    const response = await asTrainer(
      request(app).post(`/proposals/${PROPOSAL}/resolution`),
    )
      .send({ decision: 'ACEPTADA_PARCIAL', acceptedAdjustmentIds: [ADJ_LOAD] })
      .expect(200);

    expect(response.body).toEqual({
      proposalId: PROPOSAL,
      state: 'ACEPTADA_PARCIAL',
      resultingVersionNumber: 2,
    });

    const command = vi.mocked(proposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.plan).toMatchObject({
      state: 'ACEPTADA_PARCIAL',
      acceptedIds: [ADJ_LOAD],
      rejectedIds: [ADJ_SCHEME],
      reviewResult: 'APROBADA_CON_CAMBIOS',
    });
    expect(command.routineId).toBe(ROUTINE);
    const sets = command.newVersionDays![0]!.exercises[0]!.sets;
    expect(sets.every((set) => set.suggestedLoad === 62.5)).toBe(true);
    expect(sets.every((set) => set.minRepetitions === 3)).toBe(true);
    // La versión de origen no se modifica.
    expect(currentVersion.days[0]!.exercises[0]!.sets[0]!.suggestedLoad).toBe(
      60,
    );
  });

  it('Esc. 4: rejection requires a reason and does not create a version', async () => {
    const { app, proposalsRepository } = buildApp();

    await asTrainer(request(app).post(`/proposals/${PROPOSAL}/resolution`))
      .send({ decision: 'RECHAZADA' })
      .expect(422, {
        error: 'invalid_resolution',
        code: 'rejection_reason_required',
      });
    expect(proposalsRepository.persistResolution).not.toHaveBeenCalled();

    await asTrainer(request(app).post(`/proposals/${PROPOSAL}/resolution`))
      .send({
        decision: 'RECHAZADA',
        reason: 'El alumno reportó dolor de rodilla',
      })
      .expect(200);

    const command = vi.mocked(proposalsRepository.persistResolution).mock
      .calls[0]![0];
    expect(command.newVersionDays).toBeNull();
    expect(command.plan.reason).toBe('El alumno reportó dolor de rodilla');
    expect(proposalsRepository.findCurrentVersion).not.toHaveBeenCalled();
  });

  it('returns 409 for a proposal that is no longer pending', async () => {
    await asTrainer(
      request(buildApp({ record: proposal({ state: 'RECHAZADA' }) }).app).post(
        `/proposals/${PROPOSAL}/resolution`,
      ),
    )
      .send({ decision: 'ACEPTADA_TOTAL' })
      .expect(409, { error: 'proposal_not_pending' });

    await asTrainer(
      request(buildApp({ resolved: false }).app).post(
        `/proposals/${PROPOSAL}/resolution`,
      ),
    )
      .send({ decision: 'ACEPTADA_TOTAL' })
      .expect(409, { error: 'proposal_not_pending' });
  });

  it('returns 400 for an unknown decision', async () => {
    const { app } = buildApp();

    const response = await asTrainer(
      request(app).post(`/proposals/${PROPOSAL}/resolution`),
    )
      .send({ decision: 'APROBAR' })
      .expect(400);

    expect(response.body.error).toBe('invalid_request_body');
  });
});
