import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  AssignedStudentRecord,
  StudentRecord,
  StudentsRepository,
} from '../../src/modules/students/application/ports/students.repository';
import type { TrainerAssignments } from '../../src/modules/students/application/ports/trainer-assignments.port';

const TRAINER = '33333333-3333-4333-a333-333333333333';
const STUDENT = '11111111-1111-4111-a111-111111111111';
const now = new Date('2026-09-15T12:00:00Z');
const clock = { now: () => now };
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function blockedStudent(): StudentRecord {
  return {
    id: STUDENT,
    displayName: 'Juan Pérez',
    state: 'SUSPENDIDO',
    registeredAt: daysAgo(400),
    heightCm: 180,
    lastMeasurementOn: daysAgo(200),
  };
}

function buildApp({
  assigned = true,
  student = blockedStudent() as StudentRecord | null,
  unlockResult = true,
  assignedStudents = [] as AssignedStudentRecord[],
} = {}) {
  const studentsRepository: StudentsRepository = {
    findById: vi.fn().mockResolvedValue(student),
    findAssignedToTrainer: vi.fn().mockResolvedValue(assignedStudents),
    unlock: vi.fn().mockResolvedValue(unlockResult),
  };
  const trainerAssignments: TrainerAssignments = {
    isActive: vi.fn().mockResolvedValue(assigned),
  };
  const app = createApp({ studentsRepository, trainerAssignments, clock });
  return { app, studentsRepository, trainerAssignments };
}

describe('Students API - HU05', () => {
  it('Esc. 1: the trainer sees the block reason and the last measurement date', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get(`/students/${STUDENT}/status`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);

    expect(response.body).toMatchObject({
      studentId: STUDENT,
      bloqueado: true,
      fechaUltimaMedicion: daysAgo(200).toISOString().slice(0, 10),
      faltasConsecutivas: 3,
      alturaCm: 180,
    });
    expect(response.body.motivoBloqueo).toContain('3ª falta consecutiva');
  });

  it('returns 403 when the trainer has no active assignment with the student (RF-066)', async () => {
    const { app, studentsRepository } = buildApp({ assigned: false });

    const response = await request(app)
      .get(`/students/${STUDENT}/status`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403);

    expect(response.body).toEqual({ error: 'forbidden_not_assigned' });
    expect(studentsRepository.findById).not.toHaveBeenCalled();
  });

  it('returns 403 for a student role', async () => {
    const { app } = buildApp();

    await request(app)
      .get(`/students/${STUDENT}/status`)
      .set('x-user-id', STUDENT)
      .set('x-user-roles', 'ALUMNO')
      .expect(403, { error: 'forbidden_role' });
  });

  it('Esc. 2: unlocking without the pending measurement is rejected', async () => {
    const { app, studentsRepository } = buildApp();

    await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({})
      .expect(400, { error: 'pending_measurement_required' });

    expect(studentsRepository.unlock).not.toHaveBeenCalled();
  });

  it('rejects measurements outside the physiological range', async () => {
    const { app, studentsRepository } = buildApp();

    const response = await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ weightKg: 10, heightCm: 180 })
      .expect(400);

    expect(response.body.error).toBe('invalid_request_body');
    expect(studentsRepository.unlock).not.toHaveBeenCalled();
  });

  it('Esc. 4: a valid unlock reactivates the student and resets the strikes to 0', async () => {
    const { app, studentsRepository } = buildApp();

    const response = await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ weightKg: 82.5, heightCm: 181 })
      .expect(200);

    expect(studentsRepository.unlock).toHaveBeenCalledWith({
      studentId: STUDENT,
      trainerId: TRAINER,
      weightKg: 82.5,
      heightCm: 181,
      measuredOn: new Date('2026-09-15T00:00:00Z'),
    });
    expect(response.body).toMatchObject({
      bloqueado: false,
      motivoBloqueo: null,
      faltasConsecutivas: 0,
      fechaUltimaMedicion: '2026-09-15',
      alturaCm: 181,
    });
  });

  it('returns 409 when the student is not blocked', async () => {
    const { app, studentsRepository } = buildApp({
      student: { ...blockedStudent(), state: 'ACTIVO' },
    });

    await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ weightKg: 80, heightCm: 180 })
      .expect(409, { error: 'student_not_blocked' });

    expect(studentsRepository.unlock).not.toHaveBeenCalled();
  });

  it('returns 409 when a concurrent unlock already reactivated the student', async () => {
    const { app } = buildApp({ unlockResult: false });

    await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ weightKg: 80, heightCm: 180 })
      .expect(409, { error: 'student_not_blocked' });
  });

  it('lists the trainer portfolio with blocked students first and the renewal notice', async () => {
    const active: AssignedStudentRecord = {
      id: '22222222-2222-4222-a222-222222222222',
      displayName: 'Ana Activa',
      state: 'ACTIVO',
      registeredAt: daysAgo(100),
      heightCm: 165,
      lastMeasurementOn: daysAgo(5),
      goal: 'FUERZA',
      activeRoutine: { routineType: 'FUERZA', cycleStart: daysAgo(55) },
      pendingProposals: 0,
    };
    const blocked: AssignedStudentRecord = {
      ...blockedStudent(),
      goal: null,
      activeRoutine: null,
      pendingProposals: 0,
    };
    const { app, studentsRepository } = buildApp({
      assignedStudents: [active, blocked],
    });

    const response = await request(app)
      .get('/trainers/me/students')
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);

    expect(studentsRepository.findAssignedToTrainer).toHaveBeenCalledWith(
      TRAINER,
    );
    expect(
      response.body.map((s: { displayName: string }) => s.displayName),
    ).toEqual(['Juan Pérez', 'Ana Activa']);
    expect(response.body[1]).toMatchObject({
      objetivo: 'FUERZA',
      rutinaVigente: {
        routineType: 'FUERZA',
        diasRestantesRenovacion: 5,
        estadoAviso: 'pendiente',
      },
    });
  });
});
