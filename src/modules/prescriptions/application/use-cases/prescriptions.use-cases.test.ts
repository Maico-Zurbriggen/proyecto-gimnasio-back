import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EmptyTemplateError,
  PendingProposalError,
  RejectionReasonRequiredError,
  RoutineNotFoundError,
  RoutineNotReviewableError,
  StudentNotFoundError,
  TemplateFromAnotherGymError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import type {
  CreateRoutineCommand,
  PrescriptionsRepository,
  ReviewRoutineCommand,
  RoutineSummary,
  TemplateContent,
} from '../ports/prescriptions.repository';
import { AssignRoutineFromTemplateUseCase } from './assign-routine-from-template.use-case';
import { CreateManualRoutineUseCase } from './create-manual-routine.use-case';
import { CreateRoutineTemplateUseCase } from './create-routine-template.use-case';
import {
  GetRoutineTemplateUseCase,
  ListPendingRoutineReviewsUseCase,
} from './read-prescriptions.use-cases';
import { ReviewRoutineUseCase } from './review-routine.use-case';
import {
  SetRoutineTemplateActiveUseCase,
  UpdateRoutineTemplateUseCase,
} from './update-routine-template.use-case';

const TRAINER = '21000000-0000-4000-8000-000000000002';
const STUDENT = '21000000-0000-4000-8000-000000000004';
const GYM = '10000000-0000-4000-8000-000000000001';
const TEMPLATE = '40000000-0000-4000-8000-000000000002';

function plantilla(overrides: Partial<TemplateContent> = {}): TemplateContent {
  return {
    id: TEMPLATE,
    gymId: GYM,
    routineType: 'FUERZA',
    days: [
      {
        position: 1,
        name: 'Tren superior',
        exercises: [
          {
            exerciseId: 'ej-1',
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
          {
            exerciseId: 'ej-2',
            position: 2,
            note: 'Cuidar la espalda',
            movementPattern: 'EMPUJE_HORIZONTAL',
            sets: [],
          },
        ],
      },
      {
        position: 2,
        name: 'Tren inferior',
        exercises: [
          {
            exerciseId: 'ej-3',
            position: 1,
            note: null,
            movementPattern: 'DOMINANTE_RODILLA',
            sets: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function rutina(overrides: Partial<RoutineSummary> = {}): RoutineSummary {
  return {
    id: 'rutina-propuesta',
    studentId: STUDENT,
    routineType: 'FUERZA',
    state: 'PROPUESTA',
    origin: 'PLANTILLA_ENTRENADOR',
    targetWeeklyFrequency: 2,
    requestedAt: new Date('2026-09-21T10:00:00Z'),
    versionId: 'version-1',
    versionNumber: 1,
    ...overrides,
  };
}

function createRepo(overrides: Partial<PrescriptionsRepository> = {}) {
  const creadas: CreateRoutineCommand[] = [];
  const revisiones: ReviewRoutineCommand[] = [];

  const repo: PrescriptionsRepository = {
    listTemplatesForTrainer: vi.fn(() => Promise.resolve([])),
    findTemplateContent: vi.fn(() => Promise.resolve(plantilla())),
    findTemplateDetail: vi.fn(() => Promise.resolve(null)),
    createTemplate: vi.fn(() => Promise.resolve({ templateId: TEMPLATE })),
    updateTemplate: vi.fn(() => Promise.resolve()),
    setTemplateActive: vi.fn((_: string, __: string, active: boolean) =>
      Promise.resolve({ active }),
    ),
    findStudentGymId: vi.fn(() => Promise.resolve(GYM)),
    createProposedRoutine: vi.fn((command: CreateRoutineCommand) => {
      creadas.push(command);
      return Promise.resolve({
        routineId: 'rutina-nueva',
        versionId: 'version-nueva',
      });
    }),
    createManualRoutine: vi.fn(() =>
      Promise.resolve({
        routineId: 'rutina-manual',
        versionId: 'version-manual',
      }),
    ),
    listByStudent: vi.fn(() => Promise.resolve([])),
    findContent: vi.fn(() => Promise.resolve(null)),
    review: vi.fn((command: ReviewRoutineCommand) => {
      revisiones.push(command);
      // El repositorio archiva dentro de la transacción la vigente que haya.
      return Promise.resolve({
        archivedRoutineId:
          command.result === 'RECHAZADA' ? null : 'vigente-anterior',
      });
    }),
    listPendingReviewsForTrainer: vi.fn(() => Promise.resolve([])),
    ...overrides,
  };

  return { repo, creadas, revisiones };
}

describe('AssignRoutineFromTemplateUseCase (RF-022, RF-110)', () => {
  let repo: ReturnType<typeof createRepo>;
  let useCase: AssignRoutineFromTemplateUseCase;

  beforeEach(() => {
    repo = createRepo();
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);
  });

  it('copia la plantilla y deja la rutina en PROPUESTA', async () => {
    const result = await useCase.execute({
      trainerId: TRAINER,
      studentId: STUDENT,
      templateId: TEMPLATE,
    });

    expect(result).toEqual({
      routineId: 'rutina-nueva',
      versionId: 'version-nueva',
      state: 'PROPUESTA',
    });

    const creada = repo.creadas[0];
    expect(creada?.sourceTemplateId).toBe(TEMPLATE);
    expect(creada?.routineType).toBe('FUERZA');
    // La frecuencia objetivo sale de la cantidad de días de la plantilla.
    expect(creada?.targetWeeklyFrequency).toBe(2);
  });

  it('copia días, ejercicios y series sin perder nada', async () => {
    await useCase.execute({
      trainerId: TRAINER,
      studentId: STUDENT,
      templateId: TEMPLATE,
    });

    const dias = repo.creadas[0]?.days ?? [];
    expect(dias).toHaveLength(2);
    expect(dias[0]?.name).toBe('Tren superior');
    expect(dias[0]?.exercises).toHaveLength(2);
    expect(dias[0]?.exercises[1]?.note).toBe('Cuidar la espalda');
    expect(dias[0]?.exercises[0]?.sets[0]?.suggestedLoad).toBe(40);
  });

  it('deriva el patrón dominante de cada día', async () => {
    await useCase.execute({
      trainerId: TRAINER,
      studentId: STUDENT,
      templateId: TEMPLATE,
    });

    const dias = repo.creadas[0]?.days ?? [];
    expect(dias[0]?.dominantPattern).toBe('EMPUJE_HORIZONTAL');
    expect(dias[1]?.dominantPattern).toBe('DOMINANTE_RODILLA');
  });

  it('rechaza una plantilla de otro gimnasio', async () => {
    repo = createRepo({
      findTemplateContent: vi.fn(() =>
        Promise.resolve(plantilla({ gymId: 'otro-gimnasio' })),
      ),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toBeInstanceOf(TemplateFromAnotherGymError);
    expect(repo.creadas).toHaveLength(0);
  });

  it('rechaza una plantilla inexistente', async () => {
    repo = createRepo({
      findTemplateContent: vi.fn(() => Promise.resolve(null)),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
  });

  it('rechaza un alumno inexistente', async () => {
    repo = createRepo({
      findStudentGymId: vi.fn(() => Promise.resolve(null)),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('rechaza una plantilla sin días con ejercicios', async () => {
    repo = createRepo({
      findTemplateContent: vi.fn(() =>
        Promise.resolve(
          plantilla({
            days: [{ position: 1, name: 'Vacío', exercises: [] }],
          }),
        ),
      ),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
  });

  it('no permite dos propuestas sin resolver a la vez', async () => {
    repo = createRepo({
      listByStudent: vi.fn(() => Promise.resolve([rutina()])),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).rejects.toBeInstanceOf(PendingProposalError);
  });

  it('sí permite asignar cuando el alumno ya tiene una rutina vigente', async () => {
    repo = createRepo({
      listByStudent: vi.fn(() =>
        Promise.resolve([rutina({ id: 'vigente', state: 'VIGENTE' })]),
      ),
    });
    useCase = new AssignRoutineFromTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        templateId: TEMPLATE,
      }),
    ).resolves.toMatchObject({ state: 'PROPUESTA' });
  });
});

describe('ReviewRoutineUseCase (RF-110)', () => {
  it('al aprobar deja la rutina vigente y archiva la anterior', async () => {
    const repo = createRepo({
      listByStudent: vi.fn(() =>
        Promise.resolve([
          rutina(),
          rutina({ id: 'vigente-anterior', state: 'VIGENTE' }),
        ]),
      ),
    });
    const useCase = new ReviewRoutineUseCase(repo.repo);

    const result = await useCase.execute({
      trainerId: TRAINER,
      studentId: STUDENT,
      routineId: 'rutina-propuesta',
      result: 'APROBADA',
    });

    expect(result).toEqual({
      routineId: 'rutina-propuesta',
      state: 'VIGENTE',
      archivedRoutineId: 'vigente-anterior',
    });
    expect(repo.revisiones[0]).toMatchObject({
      reviewerTrainerId: TRAINER,
      studentId: STUDENT,
      versionId: 'version-1',
      observation: null,
    });
  });

  it('al rechazar no archiva nada', async () => {
    const repo = createRepo({
      listByStudent: vi.fn(() =>
        Promise.resolve([
          rutina(),
          rutina({ id: 'vigente-anterior', state: 'VIGENTE' }),
        ]),
      ),
    });
    const useCase = new ReviewRoutineUseCase(repo.repo);

    const result = await useCase.execute({
      trainerId: TRAINER,
      studentId: STUDENT,
      routineId: 'rutina-propuesta',
      result: 'RECHAZADA',
      observation: '  No corresponde al objetivo  ',
    });

    expect(result.state).toBe('RECHAZADA');
    expect(result.archivedRoutineId).toBeNull();
    expect(repo.revisiones[0]?.observation).toBe('No corresponde al objetivo');
  });

  it('FL-02/A2: rechazar sin motivo no llega al repositorio', async () => {
    const repo = createRepo({
      listByStudent: vi.fn(() => Promise.resolve([rutina()])),
    });
    const useCase = new ReviewRoutineUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        routineId: 'rutina-propuesta',
        result: 'RECHAZADA',
        observation: '   ',
      }),
    ).rejects.toBeInstanceOf(RejectionReasonRequiredError);
    expect(repo.revisiones).toHaveLength(0);
  });

  it('rechaza revisar una rutina que no está propuesta', async () => {
    const repo = createRepo({
      listByStudent: vi.fn(() =>
        Promise.resolve([rutina({ state: 'VIGENTE' })]),
      ),
    });
    const useCase = new ReviewRoutineUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        routineId: 'rutina-propuesta',
        result: 'APROBADA',
      }),
    ).rejects.toBeInstanceOf(RoutineNotReviewableError);
    expect(repo.revisiones).toHaveLength(0);
  });

  it('rechaza una rutina que no es del alumno', async () => {
    const repo = createRepo();
    const useCase = new ReviewRoutineUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        studentId: STUDENT,
        routineId: 'otra-rutina',
        result: 'APROBADA',
      }),
    ).rejects.toBeInstanceOf(RoutineNotFoundError);
  });
});

function comandoPlantilla() {
  return {
    trainerId: TRAINER,
    name: '  Hipertrofia 3 días  ',
    routineType: 'HIPERTROFIA' as const,
    days: [
      {
        name: 'Día A',
        exercises: [
          {
            exerciseId: 'ej-1',
            note: null,
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

describe('CreateRoutineTemplateUseCase (RF-019, RF-020)', () => {
  it('crea la plantilla con el nombre recortado', async () => {
    const repo = createRepo();
    const useCase = new CreateRoutineTemplateUseCase(repo.repo);

    const result = await useCase.execute(comandoPlantilla());

    expect(result).toEqual({ templateId: TEMPLATE });
    expect(repo.repo.createTemplate).toHaveBeenCalledWith(
      TRAINER,
      expect.objectContaining({
        name: 'Hipertrofia 3 días',
        routineType: 'HIPERTROFIA',
      }),
    );
  });

  it('rechaza una plantilla sin días antes de tocar el repositorio', async () => {
    const repo = createRepo();
    const useCase = new CreateRoutineTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({ ...comandoPlantilla(), days: [] }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
    expect(repo.repo.createTemplate).not.toHaveBeenCalled();
  });

  it('rechaza un día sin ejercicios y un ejercicio sin series', async () => {
    const repo = createRepo();
    const useCase = new CreateRoutineTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        ...comandoPlantilla(),
        days: [{ name: 'Vacío', exercises: [] }],
      }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
    await expect(
      useCase.execute({
        ...comandoPlantilla(),
        days: [
          {
            name: 'Día A',
            exercises: [{ exerciseId: 'ej-1', note: null, sets: [] }],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
    expect(repo.repo.createTemplate).not.toHaveBeenCalled();
  });
});

describe('UpdateRoutineTemplateUseCase y SetRoutineTemplateActiveUseCase', () => {
  it('reemplaza el contenido de la plantilla', async () => {
    const repo = createRepo();
    const useCase = new UpdateRoutineTemplateUseCase(repo.repo);

    await useCase.execute({ ...comandoPlantilla(), templateId: TEMPLATE });

    expect(repo.repo.updateTemplate).toHaveBeenCalledWith(
      TRAINER,
      TEMPLATE,
      expect.objectContaining({ name: 'Hipertrofia 3 días' }),
    );
  });

  it('valida la estructura antes de actualizar', async () => {
    const repo = createRepo();
    const useCase = new UpdateRoutineTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({
        ...comandoPlantilla(),
        templateId: TEMPLATE,
        days: [],
      }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
    expect(repo.repo.updateTemplate).not.toHaveBeenCalled();
  });

  it('desactiva y reactiva de forma idempotente', async () => {
    const repo = createRepo();
    const useCase = new SetRoutineTemplateActiveUseCase(repo.repo);

    await expect(
      useCase.execute({
        trainerId: TRAINER,
        templateId: TEMPLATE,
        active: false,
      }),
    ).resolves.toEqual({ active: false });
    await expect(
      useCase.execute({
        trainerId: TRAINER,
        templateId: TEMPLATE,
        active: true,
      }),
    ).resolves.toEqual({ active: true });
  });
});

describe('CreateManualRoutineUseCase (HU16)', () => {
  function comandoManual() {
    return {
      trainerId: TRAINER,
      studentId: STUDENT,
      routineType: 'HIPERTROFIA' as const,
      days: [
        {
          name: 'Día A',
          exercises: [
            {
              exerciseId: 'ej-1',
              note: null,
              sets: [
                {
                  minRepetitions: 8,
                  maxRepetitions: 12,
                  suggestedLoad: null,
                  restSeconds: 60,
                  warmup: false,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it('crea la rutina manual en PROPUESTA', async () => {
    const repo = createRepo();
    const useCase = new CreateManualRoutineUseCase(repo.repo);

    const result = await useCase.execute(comandoManual());

    expect(result).toEqual({
      routineId: 'rutina-manual',
      versionId: 'version-manual',
      state: 'PROPUESTA',
    });
    expect(repo.repo.createManualRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: STUDENT, trainerId: TRAINER }),
    );
  });

  it('no permite dos propuestas sin resolver a la vez', async () => {
    const repo = createRepo({
      listByStudent: vi.fn(() => Promise.resolve([rutina()])),
    });
    const useCase = new CreateManualRoutineUseCase(repo.repo);

    await expect(useCase.execute(comandoManual())).rejects.toBeInstanceOf(
      PendingProposalError,
    );
    expect(repo.repo.createManualRoutine).not.toHaveBeenCalled();
  });

  it('valida la estructura antes de tocar el repositorio', async () => {
    const repo = createRepo();
    const useCase = new CreateManualRoutineUseCase(repo.repo);

    await expect(
      useCase.execute({ ...comandoManual(), days: [] }),
    ).rejects.toBeInstanceOf(EmptyTemplateError);
    expect(repo.repo.createManualRoutine).not.toHaveBeenCalled();
  });
});

describe('GetRoutineTemplateUseCase', () => {
  it('devuelve el detalle de una plantilla del gimnasio', async () => {
    const detalle = {
      id: TEMPLATE,
      gymId: GYM,
      authorTrainerId: TRAINER,
      name: 'Fuerza',
      routineType: 'FUERZA' as const,
      active: true,
      days: [],
    };
    const repo = createRepo({
      findTemplateDetail: vi.fn(() => Promise.resolve(detalle)),
    });
    const useCase = new GetRoutineTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({ trainerId: TRAINER, templateId: TEMPLATE }),
    ).resolves.toEqual(detalle);
  });

  it('rechaza una plantilla inexistente', async () => {
    const repo = createRepo();
    const useCase = new GetRoutineTemplateUseCase(repo.repo);

    await expect(
      useCase.execute({ trainerId: TRAINER, templateId: TEMPLATE }),
    ).rejects.toBeInstanceOf(TemplateNotFoundError);
  });
});

describe('ListPendingRoutineReviewsUseCase (HU17)', () => {
  const pendiente = {
    routineId: 'rutina-propuesta',
    studentId: STUDENT,
    studentName: 'Ana',
    routineType: 'FUERZA' as const,
    origin: 'GENERADA',
    targetWeeklyFrequency: 3,
    requestedAt: new Date('2026-10-01T10:00:00Z'),
    requestedByName: 'Ana',
    requestedByStudent: true,
    versionId: 'version-1',
    versionNumber: 1,
    dayCount: 3,
    exerciseCount: 12,
    currentGoal: null,
    replacesActiveRoutine: false,
  };

  it('anticipa la confirmación de RN-40 cuando el tipo no coincide con el objetivo', async () => {
    const repo = createRepo({
      listPendingReviewsForTrainer: vi.fn(() =>
        Promise.resolve([
          { ...pendiente, currentGoal: 'HIPERTROFIA' as const },
          { ...pendiente, routineId: 'otra', currentGoal: 'FUERZA' as const },
          { ...pendiente, routineId: 'sin-objetivo' },
        ]),
      ),
    });

    const result = await new ListPendingRoutineReviewsUseCase(
      repo.repo,
    ).execute(TRAINER);

    expect(result.map((item) => item.goalMismatch)).toEqual([
      true,
      false,
      false,
    ]);
    expect(repo.repo.listPendingReviewsForTrainer).toHaveBeenCalledWith(
      TRAINER,
    );
  });
});
