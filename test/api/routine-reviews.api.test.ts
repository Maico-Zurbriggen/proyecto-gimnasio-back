import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  PendingRoutineReview,
  PrescriptionsRepository,
  RoutineSummary,
} from '../../src/modules/prescriptions/application/ports/prescriptions.repository';
import { RoutineNotReviewableError } from '../../src/modules/prescriptions/domain/errors/prescription-errors';
import type { TrainerAssignments } from '../../src/modules/students/application/ports/trainer-assignments.port';

const TRAINER = '21000000-0000-4000-8000-000000000002';
const STUDENT = '21000000-0000-4000-8000-000000000010';
const ROUTINE = '50000000-0000-4000-8000-000000000001';
const GYM = '10000000-0000-4000-8000-000000000001';

const entrenador = {
  'x-user-id': TRAINER,
  'x-user-roles': 'ENTRENADOR',
  'x-gym-id': GYM,
};

const propuesta: RoutineSummary = {
  id: ROUTINE,
  studentId: STUDENT,
  routineType: 'FUERZA',
  state: 'PROPUESTA',
  origin: 'GENERADA',
  targetWeeklyFrequency: 3,
  requestedAt: new Date('2026-10-01T10:00:00Z'),
  versionId: '51000000-0000-4000-8000-000000000001',
  versionNumber: 1,
};

const pendiente: PendingRoutineReview = {
  routineId: ROUTINE,
  studentId: STUDENT,
  studentName: 'Martín',
  routineType: 'FUERZA',
  origin: 'GENERADA',
  targetWeeklyFrequency: 3,
  requestedAt: new Date('2026-10-01T10:00:00Z'),
  requestedByName: 'Martín',
  requestedByStudent: true,
  versionId: propuesta.versionId,
  versionNumber: 1,
  dayCount: 3,
  exerciseCount: 12,
  currentGoal: 'HIPERTROFIA',
  replacesActiveRoutine: true,
};

function buildApp(overrides: Partial<PrescriptionsRepository> = {}) {
  const prescriptionsRepository: PrescriptionsRepository = {
    listTemplatesForTrainer: vi.fn(() => Promise.resolve([])),
    findTemplateContent: vi.fn(() => Promise.resolve(null)),
    findStudentGymId: vi.fn(() => Promise.resolve(GYM)),
    createProposedRoutine: vi.fn(() =>
      Promise.resolve({ routineId: ROUTINE, versionId: propuesta.versionId }),
    ),
    listByStudent: vi.fn(() => Promise.resolve([propuesta])),
    findContent: vi.fn(() => Promise.resolve(null)),
    review: vi.fn(() => Promise.resolve({ archivedRoutineId: null })),
    listPendingReviewsForTrainer: vi.fn(() => Promise.resolve([pendiente])),
    ...overrides,
  };
  const trainerAssignments: TrainerAssignments = {
    isActive: vi.fn(() => Promise.resolve(true)),
  };
  const app = createApp({ prescriptionsRepository, trainerAssignments });
  return { app, prescriptionsRepository };
}

describe('Bandeja de aceptación y rechazo de rutinas - HU17', () => {
  it('lista las rutinas propuestas de la cartera del entrenador', async () => {
    const { app, prescriptionsRepository } = buildApp();

    const response = await request(app)
      .get('/trainers/me/routine-reviews')
      .set(entrenador)
      .expect(200);

    expect(
      prescriptionsRepository.listPendingReviewsForTrainer,
    ).toHaveBeenCalledWith(TRAINER);
    expect(response.body).toEqual([
      {
        ...pendiente,
        requestedAt: '2026-10-01T10:00:00.000Z',
        goalMismatch: true,
      },
    ]);
  });

  it('sólo el entrenador accede a la bandeja', async () => {
    const { app } = buildApp();

    await request(app).get('/trainers/me/routine-reviews').expect(401);
    await request(app)
      .get('/trainers/me/routine-reviews')
      .set({ ...entrenador, 'x-user-roles': 'ALUMNO' })
      .expect(403);
    await request(app)
      .get('/trainers/me/routine-reviews')
      .set({ ...entrenador, 'x-user-roles': 'SUPERADMIN' })
      .expect(403);
  });

  it('rechazar sin motivo responde 422 en el campo observation', async () => {
    const { app, prescriptionsRepository } = buildApp();

    const response = await request(app)
      .post(`/students/${STUDENT}/routines/${ROUTINE}/review`)
      .set(entrenador)
      .send({ result: 'RECHAZADA' })
      .expect(422);

    expect(response.body.error).toBe('rejection_reason_required');
    expect(response.body.fields.observation).toBeDefined();
    expect(prescriptionsRepository.review).not.toHaveBeenCalled();
  });

  it('rechazar con motivo deja la rutina RECHAZADA', async () => {
    const { app, prescriptionsRepository } = buildApp();

    const response = await request(app)
      .post(`/students/${STUDENT}/routines/${ROUTINE}/review`)
      .set(entrenador)
      .send({ result: 'RECHAZADA', observation: 'Demasiado volumen' })
      .expect(200);

    expect(response.body).toEqual({
      routineId: ROUTINE,
      state: 'RECHAZADA',
      archivedRoutineId: null,
    });
    expect(prescriptionsRepository.review).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: STUDENT,
        observation: 'Demasiado volumen',
      }),
    );
  });

  it('una decisión que llega tarde (otra pestaña ya resolvió) responde 409', async () => {
    const { app } = buildApp({
      review: vi.fn(() => Promise.reject(new RoutineNotReviewableError())),
    });

    const response = await request(app)
      .post(`/students/${STUDENT}/routines/${ROUTINE}/review`)
      .set(entrenador)
      .send({ result: 'APROBADA' })
      .expect(409);

    expect(response.body.error).toBe('routine_not_reviewable');
  });
});
