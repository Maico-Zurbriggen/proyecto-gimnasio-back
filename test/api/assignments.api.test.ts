import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { AssignmentsRepository } from '../../src/modules/assignments/application/assignments';

const GYM = '10000000-0000-4000-8000-000000000001';
const ADMIN = '21000000-0000-4000-8000-000000000001';
const TRAINER = '21000000-0000-4000-8000-000000000002';
const STUDENT = '21000000-0000-4000-8000-000000000010';

const admin = {
  'x-user-id': ADMIN,
  'x-user-roles': 'ADMINISTRADOR',
  'x-gym-id': GYM,
};

function buildApp(overrides: Partial<AssignmentsRepository> = {}) {
  const assignmentsRepository: AssignmentsRepository = {
    listStudents: vi.fn(() =>
      Promise.resolve([
        {
          studentId: STUDENT,
          displayName: 'Nuevo Alumno',
          email: 'nueva.alumna@gimnasio.test',
          trainer: null,
          assignedAt: null,
        },
      ]),
    ),
    listTrainers: vi.fn(() =>
      Promise.resolve([{ id: TRAINER, displayName: 'Lucía', studentCount: 2 }]),
    ),
    assign: vi.fn(() =>
      Promise.resolve({
        studentId: STUDENT,
        trainer: { id: TRAINER, displayName: 'Lucía' },
        previousTrainerId: null,
        unblockedRoutines: 1,
        unblockedProposals: 0,
      }),
    ),
    ...overrides,
  };
  return {
    app: createApp({ assignmentsRepository }),
    assignmentsRepository,
  };
}

describe('Asignaciones del administrador (RF-066)', () => {
  it('lista alumnos con su entrenador y los entrenadores del gimnasio', async () => {
    const { app, assignmentsRepository } = buildApp();

    const response = await request(app)
      .get('/admin/assignments')
      .set(admin)
      .expect(200);

    expect(response.body.students[0]).toMatchObject({
      displayName: 'Nuevo Alumno',
      trainer: null,
      assignedAt: null,
    });
    expect(response.body.trainers).toEqual([
      { id: TRAINER, displayName: 'Lucía', studentCount: 2 },
    ]);
    // El gimnasio sale de la sesión.
    expect(assignmentsRepository.listStudents).toHaveBeenCalledWith(GYM);
  });

  it('asigna un entrenador con el gimnasio y el actor de la sesión', async () => {
    const { app, assignmentsRepository } = buildApp();

    const response = await request(app)
      .put(`/admin/students/${STUDENT}/trainer`)
      .set(admin)
      .send({ trainerId: TRAINER })
      .expect(200);

    expect(response.body.trainer.displayName).toBe('Lucía');
    expect(assignmentsRepository.assign).toHaveBeenCalledWith({
      gymId: GYM,
      actorUserId: ADMIN,
      studentId: STUDENT,
      trainerId: TRAINER,
    });
  });

  it('sólo el administrador gestiona asignaciones', async () => {
    const { app } = buildApp();

    await request(app).get('/admin/assignments').expect(401);
    for (const role of ['ENTRENADOR', 'ALUMNO', 'SUPERADMIN']) {
      await request(app)
        .get('/admin/assignments')
        .set({ ...admin, 'x-user-roles': role })
        .expect(403);
      await request(app)
        .put(`/admin/students/${STUDENT}/trainer`)
        .set({ ...admin, 'x-user-roles': role })
        .send({ trainerId: TRAINER })
        .expect(403);
    }
  });

  it('alumno de otro gimnasio responde 404 y entrenador inválido 422 en su campo', async () => {
    const { app: otroGimnasio } = buildApp({
      assign: vi.fn(() => Promise.resolve('ALUMNO_INEXISTENTE' as const)),
    });
    await request(otroGimnasio)
      .put(`/admin/students/${STUDENT}/trainer`)
      .set(admin)
      .send({ trainerId: TRAINER })
      .expect(404);

    const { app: invalido } = buildApp({
      assign: vi.fn(() => Promise.resolve('ENTRENADOR_INVALIDO' as const)),
    });
    const response = await request(invalido)
      .put(`/admin/students/${STUDENT}/trainer`)
      .set(admin)
      .send({ trainerId: TRAINER })
      .expect(422);
    expect(response.body.fields.trainerId).toBeDefined();
  });

  it('nadie es su propio entrenador (RN-22a)', async () => {
    const { app, assignmentsRepository } = buildApp();

    await request(app)
      .put(`/admin/students/${TRAINER}/trainer`)
      .set(admin)
      .send({ trainerId: TRAINER })
      .expect(422);
    expect(assignmentsRepository.assign).not.toHaveBeenCalled();
  });

  it('pide elegir un entrenador', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .put(`/admin/students/${STUDENT}/trainer`)
      .set(admin)
      .send({})
      .expect(400);
    expect(response.body.fields.trainerId).toEqual(['Elegí un entrenador']);
  });
});
