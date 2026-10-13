import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { PrescriptionsRepository } from '../../src/modules/prescriptions/application/ports/prescriptions.repository';
import {
  TemplateExerciseNotApprovedError,
  TemplateExerciseNotFoundError,
  TemplateFromAnotherGymError,
  TemplateInactiveError,
  TemplateNotFoundError,
} from '../../src/modules/prescriptions/domain/errors/prescription-errors';

const TRAINER = '33333333-3333-4333-a333-333333333333';
const TEMPLATE = '40000000-0000-4000-8000-000000000001';
const EXERCISE = 'e0000000-0003-4000-8000-000000000003';

function cuerpoValido() {
  return {
    name: 'Hipertrofia 3 días',
    routineType: 'HIPERTROFIA',
    days: [
      {
        name: 'Día A - Empuje',
        exercises: [
          {
            exerciseId: EXERCISE,
            note: null,
            sets: [
              {
                minRepetitions: 8,
                maxRepetitions: 10,
                suggestedLoad: 40,
                restSeconds: 90,
                warmup: false,
              },
              {
                minRepetitions: 12,
                maxRepetitions: 15,
                suggestedLoad: null,
                restSeconds: 60,
                warmup: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

function detalle() {
  return {
    id: TEMPLATE,
    gymId: '10000000-0000-4000-8000-000000000001',
    authorTrainerId: TRAINER,
    name: 'Hipertrofia 3 días',
    routineType: 'HIPERTROFIA',
    active: true,
    days: [
      {
        position: 1,
        name: 'Día A - Empuje',
        exercises: [
          {
            exerciseId: EXERCISE,
            position: 1,
            note: null,
            movementPattern: 'EMPUJE_HORIZONTAL',
            sets: [
              {
                position: 1,
                minRepetitions: 8,
                maxRepetitions: 10,
                suggestedLoad: 40,
                restSeconds: 90,
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
    findTemplateDetail: vi.fn(() => Promise.resolve(detalle())),
    createTemplate: vi.fn(() => Promise.resolve({ templateId: TEMPLATE })),
    updateTemplate: vi.fn(() => Promise.resolve()),
    setTemplateActive: vi.fn(
      (_trainer: string, _template: string, active: boolean) =>
        Promise.resolve({ active }),
    ),
    findStudentGymId: vi.fn(() => Promise.resolve(null)),
    createProposedRoutine: vi.fn(),
    listByStudent: vi.fn(() => Promise.resolve([])),
    findContent: vi.fn(() => Promise.resolve(null)),
    review: vi.fn(() => Promise.resolve()),
    ...overrides,
  } as PrescriptionsRepository;
}

function auth(req: request.Test, roles = 'ENTRENADOR') {
  return req.set('x-user-id', TRAINER).set('x-user-roles', roles);
}

describe('Routine templates API - creación manual (RF-019, RF-020)', () => {
  it('crea una plantilla y responde 201', async () => {
    const repo = mockRepo();
    const app = createApp({ prescriptionsRepository: repo });

    const response = await auth(request(app).post('/routine-templates')).send(
      cuerpoValido(),
    );

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ templateId: TEMPLATE });
    expect(repo.createTemplate).toHaveBeenCalledWith(TRAINER, cuerpoValido());
  });

  it('rechaza cuerpos inválidos con 400 sin tocar el repositorio', async () => {
    const repo = mockRepo();
    const app = createApp({ prescriptionsRepository: repo });

    const sinDias = await auth(request(app).post('/routine-templates')).send({
      ...cuerpoValido(),
      days: [],
    });
    expect(sinDias.status).toBe(400);
    expect(sinDias.body.error).toBe('invalid_request_body');

    const minMayorQueMax = await auth(
      request(app).post('/routine-templates'),
    ).send({
      ...cuerpoValido(),
      days: [
        {
          name: 'Día A',
          exercises: [
            {
              exerciseId: EXERCISE,
              note: null,
              sets: [
                {
                  minRepetitions: 12,
                  maxRepetitions: 8,
                  suggestedLoad: null,
                  restSeconds: 60,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(minMayorQueMax.status).toBe(400);
    expect(repo.createTemplate).not.toHaveBeenCalled();
  });

  it('responde 404 cuando un ejercicio no es del gimnasio y 409 si no está aprobado', async () => {
    const noExiste = createApp({
      prescriptionsRepository: mockRepo({
        createTemplate: vi.fn(() =>
          Promise.reject(new TemplateExerciseNotFoundError()),
        ),
      }),
    });
    await auth(request(noExiste).post('/routine-templates'))
      .send(cuerpoValido())
      .expect(404, { error: 'template_exercise_not_found' });

    const noAprobado = createApp({
      prescriptionsRepository: mockRepo({
        createTemplate: vi.fn(() =>
          Promise.reject(new TemplateExerciseNotApprovedError()),
        ),
      }),
    });
    await auth(request(noAprobado).post('/routine-templates'))
      .send(cuerpoValido())
      .expect(409, { error: 'template_exercise_not_approved' });
  });

  it('exige sesión y rol ENTRENADOR', async () => {
    const app = createApp({ prescriptionsRepository: mockRepo() });

    await request(app)
      .post('/routine-templates')
      .send(cuerpoValido())
      .expect(401);

    await auth(request(app).post('/routine-templates'), 'ALUMNO')
      .send(cuerpoValido())
      .expect(403, { error: 'forbidden_role' });
  });

  it('devuelve el detalle de una plantilla del gimnasio', async () => {
    const app = createApp({ prescriptionsRepository: mockRepo() });

    const response = await auth(
      request(app).get(`/routine-templates/${TEMPLATE}`),
    ).expect(200);

    expect(response.body).toMatchObject({ id: TEMPLATE, active: true });
  });

  it('responde 404 ante una plantilla inexistente y 403 ante una ajena', async () => {
    const inexistente = createApp({
      prescriptionsRepository: mockRepo({
        findTemplateDetail: vi.fn(() => Promise.resolve(null)),
      }),
    });
    await auth(
      request(inexistente).get(`/routine-templates/${TEMPLATE}`),
    ).expect(404, { error: 'template_not_found' });

    const ajena = createApp({
      prescriptionsRepository: mockRepo({
        findTemplateDetail: vi.fn(() =>
          Promise.reject(new TemplateFromAnotherGymError()),
        ),
      }),
    });
    await auth(request(ajena).get(`/routine-templates/${TEMPLATE}`)).expect(
      403,
      {
        error: 'template_from_another_gym',
      },
    );
  });

  it('reemplaza el contenido con PUT y rechaza plantillas inactivas con 409', async () => {
    const repo = mockRepo();
    const app = createApp({ prescriptionsRepository: repo });

    await auth(request(app).put(`/routine-templates/${TEMPLATE}`))
      .send(cuerpoValido())
      .expect(200, { templateId: TEMPLATE });
    expect(repo.updateTemplate).toHaveBeenCalledWith(
      TRAINER,
      TEMPLATE,
      cuerpoValido(),
    );

    const inactiva = createApp({
      prescriptionsRepository: mockRepo({
        updateTemplate: vi.fn(() =>
          Promise.reject(new TemplateInactiveError()),
        ),
      }),
    });
    await auth(request(inactiva).put(`/routine-templates/${TEMPLATE}`))
      .send(cuerpoValido())
      .expect(409, { error: 'template_inactive' });
  });

  it('desactiva con DELETE y reactiva con POST /activate', async () => {
    const repo = mockRepo();
    const app = createApp({ prescriptionsRepository: repo });

    await auth(request(app).delete(`/routine-templates/${TEMPLATE}`)).expect(
      200,
      { templateId: TEMPLATE, active: false },
    );
    await auth(
      request(app).post(`/routine-templates/${TEMPLATE}/activate`),
    ).expect(200, { templateId: TEMPLATE, active: true });
    expect(repo.setTemplateActive).toHaveBeenCalledWith(
      TRAINER,
      TEMPLATE,
      false,
    );
    expect(repo.setTemplateActive).toHaveBeenCalledWith(
      TRAINER,
      TEMPLATE,
      true,
    );
  });

  it('rechaza identificadores inválidos con 400', async () => {
    const app = createApp({ prescriptionsRepository: mockRepo() });

    const response = await auth(
      request(app).get('/routine-templates/no-es-uuid'),
    ).expect(400);
    expect(response.body.error).toBe('invalid_request_parameters');
  });

  it('rechaza una plantilla inexistente al desactivar con 404', async () => {
    const app = createApp({
      prescriptionsRepository: mockRepo({
        setTemplateActive: vi.fn(() =>
          Promise.reject(new TemplateNotFoundError()),
        ),
      }),
    });

    await auth(request(app).delete(`/routine-templates/${TEMPLATE}`)).expect(
      404,
      { error: 'template_not_found' },
    );
  });
});
