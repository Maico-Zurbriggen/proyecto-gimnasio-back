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

  it('preserves the raw preference and multi-primary metadata for the AI', async () => {
    const generationsRepository = repositories();
    const useCase = new RequestRoutineGenerationUseCase(
      {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getEnabledCatalog: vi.fn().mockResolvedValue(
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
          schema_version: '2.0',
          free_text: 'Genera rutina con 3 ejercicios de triceps por dia',
          allowed_catalog: expect.arrayContaining([
            expect.objectContaining({ primary_muscles: ['TRICEPS'] }),
          ]),
        }),
      }),
    );
  });

  it('dispatches raw preferences even when deterministic counts would reject them', async () => {
    const generationsRepository = repositories();
    const gateway = { dispatchGeneration: vi.fn() };
    const useCase = new RequestRoutineGenerationUseCase(
      {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getEnabledCatalog: vi.fn().mockResolvedValue(catalog),
      },
      gateway,
      idGenerator,
      clock,
      generationsRepository,
    );
    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: '3 ejercicios de tríceps por día',
    });
    expect(gateway.dispatchGeneration).toHaveBeenCalled();
    expect(generationsRepository.createOrGetRequest).toHaveBeenCalled();
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
      getEnabledCatalog: vi.fn(),
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
      getEnabledCatalog: vi.fn(),
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
      getEnabledCatalog: vi.fn().mockResolvedValue([]),
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
      getEnabledCatalog: vi.fn().mockResolvedValue(catalog),
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
    expect(generationsRepository.createOrGetRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'generated-key',
        minimizedContext,
        ownership: { studentId, requestedByUserId },
        preferences: expect.objectContaining({
          schema_version: '2.0',
          free_text: 'quiero ganar fuerza',
          parameters: null,
          allowed_catalog: [
            expect.objectContaining({
              id: 'ex-1',
              name: 'Sentadilla',
              movement_pattern: 'DOMINANTE_RODILLA',
            }),
          ],
        }),
        retentionUntil: new Date('2026-10-14T00:00:00.000Z'),
      }),
    );
    expect(generationsRepository.registerOwnership).toHaveBeenCalledWith({
      requestId: 'req-1',
      studentId,
      requestedByUserId,
    });
    expect(gateway.dispatchGeneration).toHaveBeenCalledWith('req-1');
    expect(contextRepository.getEnabledCatalog).toHaveBeenCalledWith('gym-1');
  });

  it('reuses the caller idempotency key and does not dispatch terminal requests', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getEnabledCatalog: vi.fn().mockResolvedValue(catalog),
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
      getEnabledCatalog: vi.fn().mockResolvedValue(catalog),
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
      getEnabledCatalog: vi.fn(),
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
