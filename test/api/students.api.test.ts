import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  AssignedStudentRecord,
  StudentRecord,
  StudentsRepository,
  UnlockStudentResult,
} from '../../src/modules/students/application/ports/students.repository';
import type { TrainerAssignments } from '../../src/modules/students/application/ports/trainer-assignments.port';

const TRAINER = '33333333-3333-4333-a333-333333333333';
const STUDENT = '11111111-1111-4111-a111-111111111111';
const now = new Date('2026-09-15T12:00:00Z');
const clock = { now: () => now };
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function blockedStudent(
  blockState:
    'PENDIENTE_MEDICION' | 'PENDIENTE_APROBACION' = 'PENDIENTE_MEDICION',
): StudentRecord {
  return {
    id: STUDENT,
    displayName: 'Juan Pérez',
    registeredAt: daysAgo(400),
    heightCm: 180,
    lastMeasurementOn: daysAgo(200),
    activeMeasurementBlock: {
      state: blockState,
      reason: 'TRES_FALTAS_CONSECUTIVAS',
      consecutiveMissesAtBlock: 3,
      blockedAt: daysAgo(1),
      submittedAt: blockState === 'PENDIENTE_APROBACION' ? now : null,
    },
    checkpointResults: ['FALTA', 'FALTA', 'FALTA'],
  };
}

function buildApp({
  assigned = true,
  student = blockedStudent() as StudentRecord | null,
  unlockResult = 'APPROVED' as UnlockStudentResult,
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
  return { app, studentsRepository };
}

describe('Students API - measurement blocking', () => {
  it('shows the persisted block to the assigned trainer', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get(`/students/${STUDENT}/status`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);

    expect(response.body).toMatchObject({
      studentId: STUDENT,
      bloqueado: true,
      measurementBlockState: 'PENDIENTE_MEDICION',
      fechaUltimaMedicion: daysAgo(200).toISOString().slice(0, 10),
      faltasConsecutivas: 3,
      alturaCm: 180,
    });
  });

  it('lets a student read their own block', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .get('/students/me/measurement-block')
      .set('x-user-id', STUDENT)
      .set('x-user-roles', 'ALUMNO')
      .expect(200);

    expect(response.body).toMatchObject({
      studentId: STUDENT,
      bloqueado: true,
      measurementBlockState: 'PENDIENTE_MEDICION',
    });
  });

  it('does not reveal an unassigned student to a trainer', async () => {
    const { app, studentsRepository } = buildApp({ assigned: false });

    await request(app)
      .get(`/students/${STUDENT}/status`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(403, { error: 'forbidden_not_assigned' });

    expect(studentsRepository.findById).not.toHaveBeenCalled();
  });

  it('rejects approval while the student still owes measurements', async () => {
    const { app, studentsRepository } = buildApp({
      unlockResult: 'PENDING_MEASUREMENT',
    });

    await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({})
      .expect(409, { error: 'pending_measurement_required' });

    expect(studentsRepository.unlock).toHaveBeenCalledWith({
      studentId: STUDENT,
      trainerId: TRAINER,
      approvedAt: now,
    });
  });

  it('approves a submitted regularization without accepting measurements', async () => {
    const { app, studentsRepository } = buildApp({
      student: {
        ...blockedStudent('PENDIENTE_APROBACION'),
        activeMeasurementBlock: null,
        checkpointResults: [],
      },
    });

    const response = await request(app)
      .post(`/students/${STUDENT}/unlock`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ weightKg: 1, heightCm: 1 })
      .expect(200);

    expect(studentsRepository.unlock).toHaveBeenCalledWith({
      studentId: STUDENT,
      trainerId: TRAINER,
      approvedAt: now,
    });
    expect(response.body).toMatchObject({
      bloqueado: false,
      measurementBlockState: 'NORMAL',
      faltasConsecutivas: 0,
    });
  });

  it.each([
    ['NOT_ASSIGNED', 403, 'forbidden_not_assigned'],
    ['NOT_BLOCKED', 409, 'student_not_blocked'],
    ['ALREADY_RESOLVED', 409, 'measurement_block_already_resolved'],
  ] as const)(
    'maps %s repository result to HTTP %s',
    async (unlockResult, status, error) => {
      const { app } = buildApp({ unlockResult });

      await request(app)
        .post(`/students/${STUDENT}/unlock`)
        .set('x-user-id', TRAINER)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(status, { error });
    },
  );

  it('lists blocked students first and keeps routine notices', async () => {
    const active: AssignedStudentRecord = {
      id: '22222222-2222-4222-a222-222222222222',
      displayName: 'Ana Activa',
      registeredAt: daysAgo(100),
      heightCm: 165,
      lastMeasurementOn: daysAgo(5),
      activeMeasurementBlock: null,
      checkpointResults: ['CUMPLIDO'],
      goal: 'FUERZA',
      activeRoutine: { routineType: 'FUERZA', cycleStart: daysAgo(55) },
      pendingRoutineReviews: 1,
      pendingAdaptationProposals: 2,
    };
    const blocked: AssignedStudentRecord = {
      ...blockedStudent(),
      goal: null,
      activeRoutine: null,
      pendingRoutineReviews: 0,
      pendingAdaptationProposals: 0,
    };
    const { app } = buildApp({ assignedStudents: [active, blocked] });

    const response = await request(app)
      .get('/trainers/me/students')
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .expect(200);

    expect(
      response.body.map(
        (student: { displayName: string }) => student.displayName,
      ),
    ).toEqual(['Juan Pérez', 'Ana Activa']);
    expect(response.body[1]).toMatchObject({
      rutinaVigente: { diasRestantesRenovacion: 5, estadoAviso: 'pendiente' },
      rutinasPendientesRevision: 1,
      propuestasAdaptacionPendientes: 2,
    });
  });
});
