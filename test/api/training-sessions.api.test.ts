import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Clock } from '../../src/modules/routines/application/ports/clock';
import type {
  TrainingSessionsRepository,
  TrainingSessionView,
} from '../../src/modules/training-sessions/application/ports/training-sessions.repository';
import { AtypicalSeriesError } from '../../src/modules/training-sessions/domain/errors';
import { isAtypicalLoad } from '../../src/modules/training-sessions/domain/session-policy';

const fixedNow = new Date('2026-09-08T10:00:00Z');
const mockClock: Clock = { now: () => fixedNow };

const studentId = '11111111-1111-4111-a111-111111111111';
const otherStudentId = '99999999-9999-4999-a999-999999999999';
const sessionId = '22222222-2222-4222-a222-222222222222';
const dayId = '33333333-3333-4333-a333-333333333333';

function baseSession(
  overrides: Partial<TrainingSessionView> = {},
): TrainingSessionView {
  return {
    id: sessionId,
    studentId,
    routineId: '44444444-4444-4444-a444-444444444444',
    routineVersionId: '55555555-5555-4555-a555-555555555555',
    routineDayId: dayId,
    routineDayName: 'Día 1',
    routineDayPosition: 1,
    state: 'EN_CURSO',
    startedAt: fixedNow,
    completedAt: null,
    occurredOn: '2026-09-08',
    lastActivityAt: fixedNow,
    aptitudeWarning: null,
    compatibilityWarnings: [],
    setRecords: [
      {
        position: 1,
        prescribedExerciseId: '66666666-6666-4666-a666-666666666666',
        prescribedExerciseName: 'Sentadilla',
        performedExerciseId: null,
        performedExerciseName: null,
        prescribedMinRepetitions: 6,
        prescribedMaxRepetitions: 12,
        prescribedLoad: 20,
        warmup: false,
        performedLoad: null,
        performedRepetitions: null,
        perceivedEffort: null,
        completed: false,
        additional: false,
        omissionReason: null,
        atypicalConfirmed: false,
      },
    ],
    ...overrides,
  };
}

describe('Training sessions API (RF-027, FL-05, FL-07)', () => {
  it('inicia una sesión sobre el día elegido (T2) y congela la prescripción', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn().mockResolvedValue(baseSession()),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .post(`/students/${studentId}/training-sessions`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({ routineDayId: dayId })
      .expect(201);

    expect(response.body.id).toBe(sessionId);
    expect(response.body.state).toBe('EN_CURSO');
    expect(response.body.setRecords).toHaveLength(1);
    expect(mockRepo.start).toHaveBeenCalledWith(
      expect.objectContaining({ studentId, routineDayId: dayId }),
    );
  });

  it('rechaza 403 el acceso de un alumno a la sesión de otro (RA-01, RNF-14)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .post(`/students/${otherStudentId}/training-sessions`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({})
      .expect(403);

    expect(mockRepo.start).not.toHaveBeenCalled();
  });

  it('reanuda la sesión en curso (FL-07) y ofrece el punto exacto', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn().mockResolvedValue(baseSession()),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/training-sessions/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.id).toBe(sessionId);
    expect(response.body.state).toBe('EN_CURSO');
  });

  it('prioriza la sesión pendiente antes de iniciar otra (RN-50)', async () => {
    const { SessionAlreadyInProgressError } =
      await import('../../src/modules/training-sessions/domain/errors');
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn().mockRejectedValue(new SessionAlreadyInProgressError()),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .post(`/students/${studentId}/training-sessions`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({})
      .expect(409, /session_already_in_progress/ as never);
  });

  it('cierra la sesión manualmente como COMPLETADA (T3)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi
        .fn()
        .mockResolvedValue(
          baseSession({ state: 'COMPLETADA', completedAt: fixedNow }),
        ),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .post(`/students/${studentId}/training-sessions/${sessionId}/finish`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({})
      .expect(200);

    expect(response.body.state).toBe('COMPLETADA');
    expect(response.body.completedAt).not.toBeNull();
  });

  it('el cierre automático exige secreto del scheduler (RN-53, RN-58)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn().mockResolvedValue({ abandoned: 2, blocked: 1 }),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .get('/internal/jobs/training-sessions/expire')
      .expect(401);

    expect(mockRepo.expireInactive).not.toHaveBeenCalled();
  });

  it('el cierre automático con secreto devuelve el conteo idempotente', async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'test-cron-secret';
    try {
      const mockRepo: TrainingSessionsRepository = {
        start: vi.fn(),
        findActive: vi.fn(),
        updateSeries: vi.fn(),
        finish: vi.fn(),
        abandon: vi.fn(),
        expireInactive: vi.fn().mockResolvedValue({ abandoned: 2, blocked: 1 }),
        list: vi.fn(),
        getById: vi.fn(),
      };
      const app = createApp({
        trainingSessionsRepository: mockRepo,
        clock: mockClock,
      });

      await request(app)
        .get('/internal/jobs/training-sessions/expire')
        .set('authorization', 'Bearer test-cron-secret')
        .expect(200, { abandoned: 2, blocked: 1 });
    } finally {
      if (previousSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = previousSecret;
    }
  });

  it('el entrenador sin asignación no lee la sesión activa (RA-01 paso 2)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn().mockResolvedValue(baseSession()),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const trainerId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(false) },
    });

    await request(app)
      .get(`/students/${studentId}/training-sessions/active`)
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);

    expect(mockRepo.findActive).not.toHaveBeenCalled();
  });

  it('lista el historial paginado del propio alumno (RF-035)', async () => {
    const page = {
      items: [
        {
          id: sessionId,
          studentId,
          routineDayName: 'Día 1',
          routineDayPosition: 1,
          state: 'COMPLETADA',
          startedAt: fixedNow,
          completedAt: fixedNow,
          occurredOn: '2026-09-08',
          totalSeries: 10,
          completedSeries: 8,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    };
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn().mockResolvedValue(page),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/training-sessions?page=1&pageSize=20`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].completedSeries).toBe(8);
    expect(mockRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ studentId, page: 1, pageSize: 20 }),
    );
  });

  it('rechaza 403 el historial de un alumno ajeno (RA-01, RNF-14)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .get(`/students/${otherStudentId}/training-sessions`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(403);

    expect(mockRepo.list).not.toHaveBeenCalled();
  });

  it('rechaza 403 el registro de serie de otro alumno (RA-01, RNF-14)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .patch(
        `/students/${otherStudentId}/training-sessions/${sessionId}/records/1`,
      )
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({ performedLoad: 20, performedRepetitions: 10, completed: true })
      .expect(403);

    expect(mockRepo.updateSeries).not.toHaveBeenCalled();
  });

  it('rechaza 403 el cierre manual de otro alumno (RA-01, RNF-14)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .post(`/students/${otherStudentId}/training-sessions/${sessionId}/finish`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({})
      .expect(403);

    expect(mockRepo.finish).not.toHaveBeenCalled();
  });

  it('rechaza 403 el detalle de otro alumno (RA-01, RNF-14)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    await request(app)
      .get(`/students/${otherStudentId}/training-sessions/${sessionId}`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(403);

    expect(mockRepo.getById).not.toHaveBeenCalled();
  });

  it('el entrenador sin asignación no lista el historial (RA-01 paso 2)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const trainerId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(false) },
    });

    await request(app)
      .get(`/students/${studentId}/training-sessions`)
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);

    expect(mockRepo.list).not.toHaveBeenCalled();
  });

  it('exige confirmación ante serie atípica sin confirmar (RN-55a)', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi
        .fn()
        .mockRejectedValue(new AtypicalSeriesError(100, 200)),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn(),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .patch(`/students/${studentId}/training-sessions/${sessionId}/records/1`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .send({ performedLoad: 200, performedRepetitions: 5, completed: true })
      .expect(409);

    expect(response.body).toEqual({
      error: 'atypical_series_requires_confirmation',
      message:
        'La carga supera el 150% de tu mejor marca en este ejercicio. Confirmala explícitamente para registrarla.',
      bestHistorical: 100,
      attemptedLoad: 200,
    });
  });

  describe('HU22 Criterio 5 / RN-55a: Pruebas de contrato para valores atípicos y límites', () => {
    const bestHistorical = 100;

    function createAtypicalTestApp() {
      const mockRepo: TrainingSessionsRepository = {
        start: vi.fn(),
        findActive: vi.fn(),
        updateSeries: vi.fn(async (cmd) => {
          if (
            cmd.performedLoad !== undefined &&
            cmd.performedLoad !== null &&
            !cmd.atypicalConfirmed &&
            isAtypicalLoad(cmd.performedLoad, bestHistorical)
          ) {
            throw new AtypicalSeriesError(bestHistorical, cmd.performedLoad);
          }
          return baseSession({
            setRecords: [
              {
                ...baseSession().setRecords[0]!,
                performedLoad: cmd.performedLoad ?? null,
                performedRepetitions: cmd.performedRepetitions ?? null,
                completed: cmd.completed ?? false,
                atypicalConfirmed: cmd.atypicalConfirmed ?? false,
              },
            ],
          });
        }),
        finish: vi.fn(),
        abandon: vi.fn(),
        expireInactive: vi.fn(),
        list: vi.fn(),
        getById: vi.fn(),
      };
      const app = createApp({
        trainingSessionsRepository: mockRepo,
        clock: mockClock,
      });
      return { app, mockRepo };
    }

    it('caso límite 150% exacto: carga igual al 150% del mejor histórico no es atípica y se registra sin pedir confirmación', async () => {
      const { app, mockRepo } = createAtypicalTestApp();

      const response = await request(app)
        .patch(
          `/students/${studentId}/training-sessions/${sessionId}/records/1`,
        )
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({ performedLoad: 150, performedRepetitions: 10, completed: true })
        .expect(200);

      expect(mockRepo.updateSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId,
          sessionId,
          position: 1,
          performedLoad: 150,
          performedRepetitions: 10,
          completed: true,
        }),
      );
      expect(response.body.setRecords[0].performedLoad).toBe(150);
      expect(response.body.setRecords[0].atypicalConfirmed).toBe(false);
    });

    it('caso límite 150,01%: carga del 150,01% del mejor histórico sin confirmación se rechaza con 409 y contrato esperado', async () => {
      const { app, mockRepo } = createAtypicalTestApp();

      const response = await request(app)
        .patch(
          `/students/${studentId}/training-sessions/${sessionId}/records/1`,
        )
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({
          performedLoad: 150.01,
          performedRepetitions: 10,
          completed: true,
        })
        .expect(409);

      expect(response.body).toEqual({
        error: 'atypical_series_requires_confirmation',
        message:
          'La carga supera el 150% de tu mejor marca en este ejercicio. Confirmala explícitamente para registrarla.',
        bestHistorical: 100,
        attemptedLoad: 150.01,
      });
      expect(mockRepo.updateSeries).toHaveBeenCalledTimes(1);
    });

    it('caso límite 150,01%: carga del 150,01% del mejor histórico con confirmación explícita se registra con 200 OK', async () => {
      const { app, mockRepo } = createAtypicalTestApp();

      const response = await request(app)
        .patch(
          `/students/${studentId}/training-sessions/${sessionId}/records/1`,
        )
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({
          performedLoad: 150.01,
          performedRepetitions: 10,
          completed: true,
          atypicalConfirmed: true,
        })
        .expect(200);

      expect(mockRepo.updateSeries).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId,
          sessionId,
          position: 1,
          performedLoad: 150.01,
          performedRepetitions: 10,
          completed: true,
          atypicalConfirmed: true,
        }),
      );
      expect(response.body.setRecords[0].performedLoad).toBe(150.01);
      expect(response.body.setRecords[0].atypicalConfirmed).toBe(true);
    });
  });

  it('devuelve el detalle de una sesión con prescripto y ejecutado', async () => {
    const mockRepo: TrainingSessionsRepository = {
      start: vi.fn(),
      findActive: vi.fn(),
      updateSeries: vi.fn(),
      finish: vi.fn(),
      abandon: vi.fn(),
      expireInactive: vi.fn(),
      list: vi.fn(),
      getById: vi.fn().mockResolvedValue(baseSession()),
    };
    const app = createApp({
      trainingSessionsRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/training-sessions/${sessionId}`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.id).toBe(sessionId);
    expect(response.body.setRecords).toHaveLength(1);
  });
});
