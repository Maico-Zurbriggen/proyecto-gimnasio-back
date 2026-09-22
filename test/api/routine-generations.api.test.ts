import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Clock } from '../../src/modules/routines/application/ports/clock';
import type { GenerationContextRepository } from '../../src/modules/routine-generations/application/ports/generation-context.repository';
import type { GeneratedRoutinesRepository } from '../../src/modules/routine-generations/application/ports/generated-routines.repository';
import type { IdGenerator } from '../../src/modules/routine-generations/application/ports/id-generator';
import type { RoutineGenerationGateway } from '../../src/modules/routine-generations/application/ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from '../../src/modules/routine-generations/application/ports/routine-generations.repository';

describe('Routine Generations API', () => {
  const fixedNow = new Date('2026-09-14T00:00:00Z');
  const mockClock: Clock = { now: () => fixedNow };
  const mockIdGenerator: IdGenerator = { generate: () => 'generated-key' };
  const trainerAssignments = { isActive: vi.fn().mockResolvedValue(true) };
  const ownershipRepository: RoutineGenerationsRepository = {
    registerOwnership: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
  };

  const studentId = '11111111-1111-4111-a111-111111111111';
  const trainerId = '33333333-3333-4333-a333-333333333333';
  const otherStudentId = '44444444-4444-4444-a444-444444444444';

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
    it('accepts a self request from an ALUMNO and returns 202 with the request id', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        requestGeneration: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'pending',
          alreadyExisted: false,
        }),
      };

      const app = createApp({
        trainerAssignments,
        clock: mockClock,
        idGenerator: mockIdGenerator,
        generationContextRepository,
        routineGenerationGateway,
        routineGenerationsRepository: ownershipRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(202);

      expect(response.body).toEqual({ requestId: 'req-1', status: 'pending' });
      expect(routineGenerationGateway.requestGeneration).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'generated-key',
          gymId: 'gym-1',
          studentId,
          requestedByUserId: studentId,
          freeText: 'quiero ganar fuerza',
        }),
      );
    });

    it('returns 200 when the AI service reports the idempotencyKey already existed', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const routineGenerationGateway: RoutineGenerationGateway = {
        requestGeneration: vi.fn().mockResolvedValue({
          requestId: 'req-1',
          status: 'processing',
          alreadyExisted: true,
        }),
      };

      const app = createApp({
        trainerAssignments,
        clock: mockClock,
        idGenerator: mockIdGenerator,
        generationContextRepository,
        routineGenerationGateway,
        routineGenerationsRepository: ownershipRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({
          idempotencyKey: 'caller-key',
          textoLibre: 'quiero ganar fuerza',
        })
        .expect(200);

      expect(response.body).toEqual({
        requestId: 'req-1',
        status: 'processing',
      });
    });

    it('returns 403 when an ENTRENADOR attempts to request a generation', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(403);

      expect(response.body).toEqual({ error: 'forbidden_role' });
    });

    it('returns 403 when a multi-role user requests for another student', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', otherStudentId)
        .set('x-user-roles', 'ALUMNO,ENTRENADOR')
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

    it('returns 422 when neither textoLibre nor parametros are provided', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };

      const app = createApp({
        trainerAssignments,
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
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
        trainerAssignments,
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
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
        trainerAssignments,
        clock: mockClock,
        generationContextRepository,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(404);

      expect(response.body).toEqual({ error: 'student_not_found' });
    });

    it('returns 503 when the AI service gateway is unavailable', async () => {
      const generationContextRepository: GenerationContextRepository = {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
      const { RoutineGenerationUnavailableError } =
        await import('../../src/modules/routine-generations/domain/errors/routine-generation-errors');
      const routineGenerationGateway: RoutineGenerationGateway = {
        requestGeneration: vi
          .fn()
          .mockRejectedValue(new RoutineGenerationUnavailableError()),
      };

      const app = createApp({
        trainerAssignments,
        clock: mockClock,
        generationContextRepository,
        routineGenerationGateway,
      });

      const response = await request(app)
        .post(`/students/${studentId}/routine-generations`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({ textoLibre: 'quiero ganar fuerza' })
        .expect(503);

      expect(response.body).toEqual({ error: 'ai_service_unavailable' });
    });
  });

  describe('GET /students/:studentId/routine-generations/:requestId', () => {
    const requestId = '55555555-5555-4555-a555-555555555555';

    it('returns the snapshot to the requesting ALUMNO', async () => {
      const snapshot = {
        requestId,
        status: 'COMPLETADA',
        estructuraCandidata: { dias: [] },
        violaciones: null,
        error: null,
      };
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        registerOwnership: vi.fn(),
        findById: vi.fn().mockResolvedValue(snapshot),
      };

      const app = createApp({
        clock: mockClock,
        trainerAssignments,
        routineGenerationsRepository,
      });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .expect(200);

      expect(response.body).toEqual(snapshot);
    });

    it('returns 403 when an ALUMNO polls another student request', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', otherStudentId)
        .set('x-user-roles', 'ALUMNO')
        .expect(403);

      expect(response.body).toEqual({ error: 'forbidden_student_access' });
    });

    it('returns 404 when the request does not exist', async () => {
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        registerOwnership: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
      };

      const app = createApp({
        clock: mockClock,
        trainerAssignments,
        routineGenerationsRepository,
      });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .expect(404);

      expect(response.body).toEqual({ error: 'routine_generation_not_found' });
    });
  });

  describe('POST /students/:studentId/routine-generations/:requestId/finalize', () => {
    const requestId = '55555555-5555-4555-a555-555555555555';

    it('creates a PROPUESTA explicitly after the generation completed', async () => {
      const generatedRoutinesRepository: GeneratedRoutinesRepository = {
        finalize: vi.fn().mockResolvedValue({
          routineId: '66666666-6666-4666-a666-666666666666',
          status: 'PROPUESTA',
        }),
      };
      const app = createApp({
        clock: mockClock,
        trainerAssignments,
        generatedRoutinesRepository,
      });

      const response = await request(app)
        .post(
          `/students/${studentId}/routine-generations/${requestId}/finalize`,
        )
        .set('x-user-id', studentId)
        .set('x-user-roles', 'ALUMNO')
        .send({})
        .expect(201);

      expect(response.body).toEqual({
        routineId: '66666666-6666-4666-a666-666666666666',
        status: 'PROPUESTA',
      });
      expect(generatedRoutinesRepository.finalize).toHaveBeenCalledWith({
        requestId,
        studentId,
        requestedByUserId: studentId,
      });
    });

    it('returns 403 when an ENTRENADOR attempts to finalize a generation', async () => {
      const generatedRoutinesRepository: GeneratedRoutinesRepository = {
        finalize: vi.fn(),
      };
      const app = createApp({
        clock: mockClock,
        generatedRoutinesRepository,
      });

      await request(app)
        .post(
          `/students/${studentId}/routine-generations/${requestId}/finalize`,
        )
        .set('x-user-id', trainerId)
        .set('x-user-roles', 'ENTRENADOR')
        .send({})
        .expect(403, { error: 'forbidden_role' });

      expect(generatedRoutinesRepository.finalize).not.toHaveBeenCalled();
    });
  });
});
