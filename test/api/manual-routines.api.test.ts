import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { PrescriptionsRepository } from '../../src/modules/prescriptions/application/ports/prescriptions.repository';
import { CatalogError } from '../../src/modules/exercise-catalog/domain/catalog';
import {
  StudentNotFoundError,
  TemplateFromAnotherGymError,
} from '../../src/modules/prescriptions/domain/errors/prescription-errors';

const TRAINER = '33333333-3333-4333-a333-333333333333';
const STUDENT = '11111111-1111-4111-a111-111111111111';
const EXERCISE = 'e0000000-0003-4000-8000-000000000003';

function cuerpoValido() {
  return {
    routineType: 'FUERZA',
    days: [
      {
        name: 'Día A',
        exercises: [
          {
            exerciseId: EXERCISE,
            note: null,
            sets: [
              {
                minRepetitions: 5,
                maxRepetitions: 5,
                suggestedLoad: 60,
                restSeconds: 180,
                warmup: false,
              },
            ],
          },
        ],
      },
    ],
  };
}

function mockRepo(
  overrides: Partial<PrescriptionsRepository> = {},
): PrescriptionsRepository {
  return {
    listTemplatesForTrainer: vi.fn(() => Promise.resolve([])),
    findTemplateContent: vi.fn(() => Promise.resolve(null)),
    findTemplateDetail: vi.fn(() => Promise.resolve(null)),
    createTemplate: vi.fn(),
    updateTemplate: vi.fn(() => Promise.resolve()),
    setTemplateActive: vi.fn((_t: string, _p: string, active: boolean) =>
      Promise.resolve({ active }),
    ),
    findStudentGymId: vi.fn(() => Promise.resolve(null)),
    createProposedRoutine: vi.fn(),
    createManualRoutine: vi.fn(() =>
      Promise.resolve({ routineId: 'rutina-manual', versionId: 'v1' }),
    ),
    listByStudent: vi.fn(() => Promise.resolve([])),
    findContent: vi.fn(() => Promise.resolve(null)),
    review: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as PrescriptionsRepository;
}

describe('Manual routines API - el entrenador crea la rutina del alumno (HU16)', () => {
  it('crea la rutina en PROPUESTA y responde 201', async () => {
    const repo = mockRepo();
    const app = createApp({
      prescriptionsRepository: repo,
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });

    const response = await request(app)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(201);

    expect(response.body).toEqual({
      routineId: 'rutina-manual',
      versionId: 'v1',
      state: 'PROPUESTA',
    });
    expect(repo.createManualRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ trainerId: TRAINER, studentId: STUDENT }),
    );
  });

  it('rechaza cuerpos inválidos con 400', async () => {
    const repo = mockRepo();
    const app = createApp({
      prescriptionsRepository: repo,
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });

    await request(app)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send({ ...cuerpoValido(), days: [] })
      .expect(400);
    expect(repo.createManualRoutine).not.toHaveBeenCalled();
  });

  it('exige rol ENTRENADOR con asignación vigente', async () => {
    const app = createApp({
      prescriptionsRepository: mockRepo(),
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(false) },
    });

    await request(app)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(403);

    const comoAlumno = createApp({ prescriptionsRepository: mockRepo() });
    await request(comoAlumno)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', STUDENT)
      .set('x-user-roles', 'ALUMNO')
      .send(cuerpoValido())
      .expect(403, { error: 'forbidden_role' });
  });

  it('responde 404 ante alumno inexistente y 403 ante otro gimnasio', async () => {
    const sinAlumno = createApp({
      prescriptionsRepository: mockRepo({
        listByStudent: vi.fn(() => Promise.resolve([])),
        createManualRoutine: vi.fn(() =>
          Promise.reject(new StudentNotFoundError()),
        ),
      }),
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });
    await request(sinAlumno)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(404, { error: 'student_not_found' });

    const otroGimnasio = createApp({
      prescriptionsRepository: mockRepo({
        createManualRoutine: vi.fn(() =>
          Promise.reject(new TemplateFromAnotherGymError()),
        ),
      }),
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });
    await request(otroGimnasio)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(403, { error: 'template_from_another_gym' });
  });

  it('responde 409 si hay propuesta pendiente o un ejercicio no está habilitado', async () => {
    const conPropuesta = createApp({
      prescriptionsRepository: mockRepo({
        listByStudent: vi.fn(() =>
          Promise.resolve([
            {
              id: 'r1',
              studentId: STUDENT,
              routineType: 'FUERZA',
              state: 'PROPUESTA',
              origin: 'PLANTILLA_ENTRENADOR',
              targetWeeklyFrequency: 3,
              requestedAt: new Date(),
              versionId: 'v1',
              versionNumber: 1,
            },
          ]),
        ),
      }),
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });
    await request(conPropuesta)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(409, { error: 'pending_proposal' });

    const noHabilitado = createApp({
      prescriptionsRepository: mockRepo({
        createManualRoutine: vi.fn(() =>
          Promise.reject(new CatalogError('routine_exercise_unavailable', 409)),
        ),
      }),
      trainerAssignments: { isActive: vi.fn().mockResolvedValue(true) },
    });
    await request(noHabilitado)
      .post(`/students/${STUDENT}/routines/manual`)
      .set('x-user-id', TRAINER)
      .set('x-user-roles', 'ENTRENADOR')
      .send(cuerpoValido())
      .expect(409, { error: 'routine_exercise_unavailable' });
  });
});
