import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type { GenerationContextRepository } from '../ports/generation-context.repository';
import type { IdGenerator } from '../ports/id-generator';
import type { RoutineGenerationGateway } from '../ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';
import { RequestRoutineGenerationUseCase } from './request-routine-generation.use-case';
import { ContextInsufficientError } from '../../domain/errors/context-insufficient.error';

describe('RequestRoutineGenerationUseCase', () => {
  const fixedNow = new Date('2026-09-14T00:00:00Z');
  const clock: Clock = { now: () => fixedNow };
  const idGenerator: IdGenerator = { generate: () => 'generated-key' };
  const studentId = '11111111-1111-4111-a111-111111111111';
  const requestedByUserId = '33333333-3333-4333-a333-333333333333';
  const minimizedContext = {
    nivelExperiencia: 'intermedio',
    diasSemanalesDisponibles: 3,
    objetivosActivos: ['fuerza'],
    condiciones: [],
  };
  const catalog = [
    { id: 'ex-1', nombre: 'Sentadilla', patronMovimiento: 'DOMINANTE_RODILLA' },
  ];

  it('rejects automatic generation without a declared objective before calling the catalog or gateway', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi.fn().mockResolvedValue({
        gymId: 'gym-1',
        minimizedContext: { ...minimizedContext, objetivosActivos: [] },
      }),
      getPrefilteredCatalog: vi.fn(),
    };
    const gateway = { dispatchGeneration: vi.fn() };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      repositories(),
    );
    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'generar rutina',
      }),
    ).rejects.toBeInstanceOf(ContextInsufficientError);
    expect(contextRepository.getPrefilteredCatalog).not.toHaveBeenCalled();
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
  });

  it('persists explicit muscle counts and primary muscles for the LLM', async () => {
    const generationsRepository = repositories();
    const useCase = new RequestRoutineGenerationUseCase(
      {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(
          [1, 2, 3].map((id) => ({
            id: `triceps-${id}`,
            nombre: `Tríceps ${id}`,
            patronMovimiento: 'AISLAMIENTO_SUPERIOR',
            musculosPrimarios: ['TRICEPS'],
          })),
        ),
      },
      { dispatchGeneration: vi.fn() },
      idGenerator,
      clock,
      generationsRepository,
    );
    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'Genera rutina con 3 ejercicios de triceps por dia',
    });
    expect(generationsRepository.createOrGetRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          muscle_counts_per_day: [{ muscle: 'TRICEPS', count: 3 }],
          allowed_catalog: expect.arrayContaining([
            expect.objectContaining({ primary_muscles: ['TRICEPS'] }),
          ]),
        }),
      }),
    );
  });

  it('does not dispatch a request when the compatible catalog cannot fulfill the count', async () => {
    const generationsRepository = repositories();
    const gateway = { dispatchGeneration: vi.fn() };
    const useCase = new RequestRoutineGenerationUseCase(
      {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      },
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );
    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: '3 ejercicios de tríceps por día',
      }),
    ).rejects.toMatchObject({
      violations: [expect.stringContaining('hay 0 compatibles')],
    });
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
    expect(generationsRepository.createOrGetRequest).not.toHaveBeenCalled();
  });

  function repositories(
    request = {
      requestId: 'req-1',
      status: 'PENDIENTE',
      alreadyExisted: false,
    },
  ) {
    const generationsRepository: RoutineGenerationsRepository = {
      findProposedRoutineId: vi.fn().mockResolvedValue('old-routine'),
      createOrGetRequest: vi.fn().mockResolvedValue(request),
      registerOwnership: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn(),
    };
    return generationsRepository;
  }

  it('rejects requests without text or structured parameters before loading context', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi.fn(),
      getPrefilteredCatalog: vi.fn(),
    };
    const generationsRepository = repositories();
    const gateway: RoutineGenerationGateway = {
      dispatchGeneration: vi.fn(),
    };

    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );

    await expect(
      useCase.execute({ studentId, requestedByUserId }),
    ).rejects.toBeInstanceOf(MissingGenerationInputError);
    expect(contextRepository.getStudentContext).not.toHaveBeenCalled();
  });

  it('throws StudentNotFoundError when the student does not exist', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi.fn().mockResolvedValue(null),
      getPrefilteredCatalog: vi.fn(),
    };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      { dispatchGeneration: vi.fn() },
      idGenerator,
      clock,
      repositories(),
    );

    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'quiero fuerza',
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('rejects an empty prefiltered catalog before persisting or dispatching', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue([]),
    };
    const generationsRepository = repositories();
    const gateway: RoutineGenerationGateway = {
      dispatchGeneration: vi.fn(),
    };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );

    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'quiero fuerza',
      }),
    ).rejects.toBeInstanceOf(EmptyPrefilteredCatalogError);
    expect(generationsRepository.createOrGetRequest).not.toHaveBeenCalled();
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
  });

  it('persists the minimized request and dispatches only its UUID', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
    };
    const generationsRepository = repositories();
    const gateway: RoutineGenerationGateway = {
      dispatchGeneration: vi.fn().mockResolvedValue(undefined),
    };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );

    const result = await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
    });

    expect(result).toEqual({
      requestId: 'req-1',
      status: 'PENDIENTE',
      alreadyExisted: false,
    });
    expect(generationsRepository.createOrGetRequest).toHaveBeenCalledWith({
      idempotencyKey: 'generated-key',
      minimizedContext,
      preferences: {
        prescription_constraints: expect.objectContaining({
          purposes: expect.objectContaining({
            HIPERTROFIA: {
              weekly_frequency: [3, 6],
              work_sets_per_exercise: [3, 4],
              repetitions: [6, 12],
              rest_seconds: [60, 120],
              exercises_per_day: [5, 8],
            },
          }),
          required_pattern_groups: [
            ['EMPUJE_HORIZONTAL'],
            ['TRACCION_HORIZONTAL', 'TRACCION_VERTICAL'],
            ['DOMINANTE_RODILLA'],
            ['DOMINANTE_CADERA'],
          ],
        }),
        free_text: 'quiero ganar fuerza',
        parameters: null,
        allowed_catalog: [
          {
            id: 'ex-1',
            name: 'Sentadilla',
            movement_pattern: 'DOMINANTE_RODILLA',
          },
        ],
      },
      retentionUntil: new Date('2026-10-14T00:00:00.000Z'),
    });
    expect(generationsRepository.registerOwnership).toHaveBeenCalledWith({
      requestId: 'req-1',
      studentId,
      requestedByUserId,
    });
    expect(gateway.dispatchGeneration).toHaveBeenCalledWith('req-1');
    expect(contextRepository.getPrefilteredCatalog).toHaveBeenCalledWith(
      studentId,
      'gym-1',
      fixedNow,
    );
  });

  it('reuses the caller idempotency key and does not dispatch terminal requests', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
    };
    const generationsRepository = repositories({
      requestId: 'req-1',
      status: 'COMPLETADA',
      alreadyExisted: true,
    });
    const gateway: RoutineGenerationGateway = {
      dispatchGeneration: vi.fn(),
    };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );

    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      idempotencyKey: 'caller-key',
    });

    expect(generationsRepository.createOrGetRequest).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'caller-key' }),
    );
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
  });

  it('captures the pending routine only for an explicitly allowed local regeneration', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
    };
    const generationsRepository = repositories();
    const gateway = { dispatchGeneration: vi.fn() };
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      gateway,
      idGenerator,
      clock,
      generationsRepository,
      true,
    );
    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'otro prompt',
      regenerate: true,
    });
    expect(generationsRepository.findProposedRoutineId).toHaveBeenCalledWith(
      studentId,
    );
    expect(generationsRepository.createOrGetRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({
          free_text: 'otro prompt',
          local_test_regeneration: {
            replaces_proposed_routine_id: 'old-routine',
          },
        }),
      }),
    );
  });

  it('rejects a test regeneration before loading context when it is disabled', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi.fn(),
      getPrefilteredCatalog: vi.fn(),
    };
    const generationsRepository = repositories();
    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      { dispatchGeneration: vi.fn() },
      idGenerator,
      clock,
      generationsRepository,
    );
    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'otro prompt',
        regenerate: true,
      }),
    ).rejects.toMatchObject({ name: 'RoutineRegenerationNotAllowedError' });
    expect(contextRepository.getStudentContext).not.toHaveBeenCalled();
    expect(generationsRepository.createOrGetRequest).not.toHaveBeenCalled();
  });
});
