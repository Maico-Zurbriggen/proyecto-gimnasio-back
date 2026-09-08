import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Clock } from '../../src/modules/routines/application/ports/clock';
import type { RoutinesRepository } from '../../src/modules/routines/application/ports/routines.repository';
import { Routine } from '../../src/modules/routines/domain/entities/routine.entity';
import { EstadoAvisoRenovacion } from '../../src/modules/routines/domain/services/routine-renewal';

describe('Routines API - Active Routine Endpoint (T2 & T3)', () => {
  const fixedNow = new Date('2026-09-08T10:00:00Z');
  const mockClock: Clock = {
    now: () => fixedNow,
  };

  const studentId = '11111111-1111-4111-a111-111111111111';
  const otherStudentId = '99999999-9999-4999-a999-999999999999';

  it('exposes diasRestantesParaRenovacion and estado aviso "pendiente" when renewal is in the future', async () => {
    // Routine started on 2026-07-08 -> renewal is 2026-10-08 (30 days remaining from 2026-09-08)
    const activeRoutine = new Routine({
      id: '22222222-2222-4222-a222-222222222222',
      studentId,
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-07-08T00:00:00Z'),
      currentVersionNumber: 1,
    });

    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body).toMatchObject({
      id: activeRoutine.id,
      studentId,
      state: 'VIGENTE',
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      diasRestantesParaRenovacion: 30,
      avisoRenovacion: {
        estado: EstadoAvisoRenovacion.PENDIENTE,
        diasRestantes: 30,
        fechaVencimiento: '2026-10-08T00:00:00.000Z',
      },
    });
  });

  it('exposes diasRestantesParaRenovacion = 0 and estado aviso "cerrado hoy" on renewal date', async () => {
    // Routine started on 2026-06-08 -> renewal is 2026-09-08 (today!)
    const activeRoutine = new Routine({
      id: '22222222-2222-4222-a222-222222222222',
      studentId,
      routineType: 'FUERZA',
      targetWeeklyFrequency: 3,
      state: 'VIGENTE',
      origin: 'GENERADA',
      startDate: new Date('2026-06-08T00:00:00Z'),
    });

    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.diasRestantesParaRenovacion).toBe(0);
    expect(response.body.avisoRenovacion).toEqual({
      estado: EstadoAvisoRenovacion.CERRADO_HOY,
      diasRestantes: 0,
      fechaVencimiento: '2026-09-08T00:00:00.000Z',
    });
  });

  it('exposes negative diasRestantesParaRenovacion and estado aviso "vencido" when renewal date is in the past', async () => {
    // Routine started on 2026-05-01 -> renewal was 2026-08-01 (past!)
    const activeRoutine = new Routine({
      id: '22222222-2222-4222-a222-222222222222',
      studentId,
      routineType: 'RESISTENCIA_MUSCULAR',
      targetWeeklyFrequency: 3,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-05-01T00:00:00Z'),
    });

    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.diasRestantesParaRenovacion).toBeLessThan(0);
    expect(response.body.avisoRenovacion.estado).toBe(
      EstadoAvisoRenovacion.VENCIDO,
    );
  });

  it('returns 403 Forbidden when an ALUMNO tries to access another student\'s routine (prueba 403 de acceso ajeno)', async () => {
    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn(),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    // Authenticated as studentId, attempting to query otherStudentId
    const response = await request(app)
      .get(`/students/${otherStudentId}/routines/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(403);

    expect(response.body).toEqual({ error: 'forbidden_student_access' });
    expect(mockRepo.findActiveByStudentId).not.toHaveBeenCalled();
  });

  it('allows an ENTRENADOR to access a student\'s active routine', async () => {
    const trainerId = '33333333-3333-4333-a333-333333333333';
    const activeRoutine = new Routine({
      id: '22222222-2222-4222-a222-222222222222',
      studentId,
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-07-08T00:00:00Z'),
    });

    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .set('x-user-id', trainerId)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);

    expect(response.body.studentId).toBe(studentId);
  });

  it('returns 401 Unauthorized when unauthenticated', async () => {
    const app = createApp();

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .expect(401);

    expect(response.body).toEqual({ error: 'unauthorized' });
  });

  it('returns 404 Not Found when student has no active routine', async () => {
    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(null),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get(`/students/${studentId}/routines/active`)
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(404);

    expect(response.body).toEqual({ error: 'active_routine_not_found' });
  });

  it('returns 400 Bad Request when studentId is not a valid UUID', async () => {
    const app = createApp();

    const response = await request(app)
      .get('/students/invalid-uuid/routines/active')
      .set('x-user-id', 'invalid-uuid')
      .set('x-user-roles', 'ALUMNO')
      .expect(400);

    expect(response.body.error).toBe('invalid_request_parameters');
  });

  it('works with the direct endpoint /routines/active for authenticated student', async () => {
    const activeRoutine = new Routine({
      id: '22222222-2222-4222-a222-222222222222',
      studentId,
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      state: 'VIGENTE',
      origin: 'PLANTILLA_ENTRENADOR',
      startDate: new Date('2026-07-08T00:00:00Z'),
    });

    const mockRepo: RoutinesRepository = {
      findActiveByStudentId: vi.fn().mockResolvedValue(activeRoutine),
    };

    const app = createApp({
      routinesRepository: mockRepo,
      clock: mockClock,
    });

    const response = await request(app)
      .get('/routines/active')
      .set('x-user-id', studentId)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body.id).toBe(activeRoutine.id);
    expect(response.body.diasRestantesParaRenovacion).toBe(30);
    expect(response.body.avisoRenovacion.estado).toBe('pendiente');
  });
});

