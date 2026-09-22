import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Clock } from '../../src/modules/routines/application/ports/clock';
import type { GenerationContextRepository } from '../../src/modules/routine-generations/application/ports/generation-context.repository';
import type { IdGenerator } from '../../src/modules/routine-generations/application/ports/id-generator';
import type { LatestRoutineGenerationRepository } from '../../src/modules/routine-generations/application/ports/latest-routine-generation.repository';
import type { RoutineGenerationGateway } from '../../src/modules/routine-generations/application/ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from '../../src/modules/routine-generations/application/ports/routine-generations.repository';

describe('Routine Generations API', () => {
  const fixedNow = new Date('2026-09-14T00:00:00Z');
  const mockClock: Clock = { now: () => fixedNow };
  const mockIdGenerator: IdGenerator = { generate: () => 'generated-key' };

  const studentId = '11111111-1111-4111-a111-111111111111';
  const trainerId = '33333333-3333-4333-a333-333333333333';
  const alumnoId = '44444444-4444-4444-a444-444444444444';

  const minimizedContext = {
    nivelExperiencia: 'intermedio',
    diasSemanalesDisponibles: 3,
    objetivosActivos: ['fuerza'],
    condiciones: [],
  };
  const catalog = [
    { id: 'ex-1', nombre: 'Sentadilla', patronMovimiento: 'DOMINANTE_RODILLA' },
  ];

  describe('POST /students/:studentId/routine-generations', () => {
    it('accepts a request from an ENTRENADOR and returns 202 with the request id', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          idempotencyKey: 'generated-key',
          status: 'PENDIENTE',
        }),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        dispatchGeneration: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'queued',
        }),
      };

      const app = createApp({
        clock: mockClock,
        idGenerator: mockIdGenerator,
        generationContextRepository,
        routineGenerationsRepository,
        routineGenerationGateway,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(202);

      expect(response.body).toEqual({ requestId: 'req-1', status: 'queued' });
      expect(routineGenerationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'generated-key' }),
      );
      expect(routineGenerationGateway.dispatchGeneration).toHaveBeenCalledWith(
        'req-1',
      );
    });

    it('returns 200 when the idempotencyKey already exists and is still pending', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          idempotencyKey: 'caller-key',
          status: 'PENDIENTE',
        }),
        create: vi.fn(),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        dispatchGeneration: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'queued',
        }),
      };

      const app = createApp({
        clock: mockClock,
        idGenerator: mockIdGenerator,
        generationContextRepository,
        routineGenerationsRepository,
        routineGenerationGateway,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({
          idempotencyKey: 'caller-key',
          textoLibre: 'quiero ganar fuerza',
        })
        .expect(200);

      expect(response.body).toEqual({
        requestId: 'req-1',
        status: 'queued',
      });
      expect(routineGenerationsRepository.create).not.toHaveBeenCalled();
    });

    it('accepts a request from an ALUMNO for themselves and records ownership', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          idempotencyKey: 'generated-key',
          status: 'PENDIENTE',
        }),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        dispatchGeneration: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'queued',
        }),
      };

      const app = createApp({
        clock: mockClock,
        idGenerator: mockIdGenerator,
        generationContextRepository,
        routineGenerationsRepository,
        routineGenerationGateway,
      });

      const response = await request(app)
        .post(`/students/${alumnoId}/routine-generations`)
        .set('x-user-id', alumnoId)
        .set('x-user-roles', 'ALUMNO')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(202);

      expect(response.body).toEqual({ requestId: 'req-1', status: 'queued' });
      expect(routineGenerationsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: alumnoId,
          requestedByUserId: alumnoId,
        }),
      );
    });

    it('returns 403 when an ALUMNO attempts to request a generation for another student', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', alumnoId)
        .set('x-user-roles', 'ALUMNO')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(403);

      expect(response.body).toEqual({ error: 'forbidden_student_access' });
    });

    it('returns 401 when unauthenticated', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(401);

      expect(response.body).toEqual({ error: 'unauthorized' });
    });

    it('returns 400 when the request body is not valid JSON', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('Content-Type', 'application/json')
        .send('{"textoLibre":')
        .expect(400);

      expect(response.body).toEqual({ error: 'invalid_json_body' });
    });

    it('returns 422 when neither textoLibre nor parametros are provided', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };

      const app = createApp({
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({})
        .expect(422);

      expect(response.body).toEqual({ error: 'missing_generation_input' });
    });

    it('returns 422 when the prefiltered catalog is empty after filtering by gym inventory', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue([]),
      };

      const app = createApp({
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(422);

      expect(response.body).toEqual({ error: 'empty_prefiltered_catalog' });
    });

    it('returns 404 when the student does not exist', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi.fn().mockResolvedValue(null),
        getPrefilteredCatalog: vi.fn(),
      };

      const app = createApp({
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(404);

      expect(response.body).toEqual({ error: 'student_not_found' });
    });

    it('returns 202 when the request persists but immediate dispatch is unavailable', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const { RoutineGenerationUnavailableError } =
        await import('../../src/modules/routine-generations/domain/errors/routine-generation-errors');
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          idempotencyKey: 'generated-key',
          status: 'PENDIENTE',
        }),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        dispatchGeneration: vi
          .fn()
          .mockRejectedValue(new RoutineGenerationUnavailableError()),
      };

      const app = createApp({
        clock: mockClock,
        generationContextRepository,
        routineGenerationsRepository,
        routineGenerationGateway,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(202);

      expect(response.body).toEqual({
        requestId: 'req-1',
        status: 'PENDIENTE',
        dispatchStatus: 'DEFERRED',
      });
    });
  });

  describe('GET /students/:studentId/routine-generations/latest', () => {
    it('returns the latest persisted generation', async () => {
      const snapshot = {
        requestId: '55555555-5555-4555-a555-555555555555',
        status: 'COMPLETADA',
        estructuraCandidata: { days: [] },
        violaciones: null,
        error: null,
      };
      const latestRoutineGenerationRepository: LatestRoutineGenerationRepository =
        {
          findLatestByStudentId: vi.fn().mockResolvedValue(snapshot),
        };
      const app = createApp({
        clock: mockClock,
        latestRoutineGenerationRepository,
      });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/latest`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(200);

      expect(response.body).toEqual(snapshot);
      expect(
        latestRoutineGenerationRepository.findLatestByStudentId,
      ).toHaveBeenCalledWith(studentId);
    });

    it('returns 204 when the student has no generation requests', async () => {
      const latestRoutineGenerationRepository: LatestRoutineGenerationRepository =
        {
          findLatestByStudentId: vi.fn().mockResolvedValue(null),
        };
      const app = createApp({
        clock: mockClock,
        latestRoutineGenerationRepository,
      });

      await request(app)
        .get(`/students/${studentId}/routine-generations/latest`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(204);
    });
  });

  describe('GET /students/:studentId/routine-generations/:requestId', () => {
    const requestId = '55555555-5555-4555-a555-555555555555';

    it('returns the snapshot for an ENTRENADOR', async () => {
      const snapshot = {
        requestId,
        status: 'COMPLETADA',
        estructuraCandidata: { dias: [] },
        violaciones: null,
        error: null,
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn().mockResolvedValue(snapshot),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
      };

      const app = createApp({ clock: mockClock, routineGenerationsRepository });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(200);

      expect(response.body).toEqual(snapshot);
    });

    it('returns the snapshot for an ALUMNO who owns the request', async () => {
      const snapshot = {
        requestId,
        status: 'PROCESANDO',
        estructuraCandidata: null,
        violaciones: null,
        error: null,
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn().mockResolvedValue(snapshot),
        findRequestOwner: vi.fn().mockResolvedValue({ studentId: alumnoId }),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
      };

      const app = createApp({ clock: mockClock, routineGenerationsRepository });

      const response = await request(app)
        .get(`/students/${alumnoId}/routine-generations/${requestId}`)
        .set('x-user-id', alumnoId)
        .set('x-user-roles', 'ALUMNO')
        .expect(200);

      expect(response.body).toEqual(snapshot);
    });

    it('returns 403 for an ALUMNO consulting under another studentId path', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', alumnoId)
        .set('x-user-roles', 'ALUMNO')
        .expect(403);

      expect(response.body).toEqual({ error: 'forbidden_student_access' });
    });

    it('returns 404 for an ALUMNO consulting a request they do not own', async () => {
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn(),
        findRequestOwner: vi.fn().mockResolvedValue({ studentId }),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
      };

      const app = createApp({ clock: mockClock, routineGenerationsRepository });

      const response = await request(app)
        .get(`/students/${alumnoId}/routine-generations/${requestId}`)
        .set('x-user-id', alumnoId)
        .set('x-user-roles', 'ALUMNO')
        .expect(404);

      expect(response.body).toEqual({ error: 'routine_generation_not_found' });
      expect(routineGenerationsRepository.findById).not.toHaveBeenCalled();
    });

    it('returns 404 when the request does not exist', async () => {
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
      };

      const app = createApp({ clock: mockClock, routineGenerationsRepository });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(404);

      expect(response.body).toEqual({ error: 'routine_generation_not_found' });
    });
  });
});
