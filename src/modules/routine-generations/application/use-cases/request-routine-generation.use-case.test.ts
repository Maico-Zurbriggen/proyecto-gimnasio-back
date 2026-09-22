import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmptyPrefilteredCatalogError,
  MissingGenerationInputError,
  RoutineGenerationAlreadyExistsError,
  RoutineGenerationUnavailableError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type { GenerationContextRepository } from '../ports/generation-context.repository';
import type { IdGenerator } from '../ports/id-generator';
import type { RoutineGenerationGateway } from '../ports/routine-generation.gateway';
import type { RoutineGenerationsRepository } from '../ports/routine-generations.repository';
import {
  RequestRoutineGenerationUseCase,
  hashGenerationInput,
} from './request-routine-generation.use-case';

describe('RequestRoutineGenerationUseCase', () => {
  const fixedNow = new Date('2026-09-14T00:00:00Z');
  const clock: Clock = { now: () => fixedNow };
  const idGenerator: IdGenerator = { generate: () => 'generated-key' };
  const retentionDays = 30;

  const studentId = '11111111-1111-4111-a111-111111111111';
  const requestedByUserId = '33333333-3333-4333-a333-333333333333';
  const requestId = '83271cf7-9264-47b5-b85f-d09f05c99326';

  const minimizedContext = {
    nivelExperiencia: 'intermedio',
    diasSemanalesDisponibles: 3,
    objetivosActivos: ['fuerza'],
    condiciones: [],
  };

  const catalog = [
    { id: 'ex-1', nombre: 'Sentadilla', patronMovimiento: 'DOMINANTE_RODILLA' },
  ];

  function buildUseCase(overrides: {
    contextRepository?: GenerationContextRepository;
    generationsRepository?: RoutineGenerationsRepository;
    gateway?: RoutineGenerationGateway;
  }): {
    useCase: RequestRoutineGenerationUseCase;
    contextRepository: GenerationContextRepository;
    generationsRepository: RoutineGenerationsRepository;
    gateway: RoutineGenerationGateway;
  } {
    const contextRepository: GenerationContextRepository =
      overrides.contextRepository ?? {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
      };
    const generationsRepository: RoutineGenerationsRepository =
      overrides.generationsRepository ?? {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          requestId,
          idempotencyKey: 'generated-key',
          status: 'PENDIENTE',
        }),
      };
    const gateway: RoutineGenerationGateway = overrides.gateway ?? {
      dispatchGeneration: vi.fn().mockResolvedValue({
        requestId,
        status: 'queued',
      }),
    };

    const useCase = new RequestRoutineGenerationUseCase(
      contextRepository,
      generationsRepository,
      gateway,
      idGenerator,
      clock,
      retentionDays,
    );

    return { useCase, contextRepository, generationsRepository, gateway };
  }

  it('throws MissingGenerationInputError when neither freeText nor parameters are provided', async () => {
    const { useCase, contextRepository } = buildUseCase({});

    await expect(
      useCase.execute({ studentId, requestedByUserId }),
    ).rejects.toBeInstanceOf(MissingGenerationInputError);
    expect(contextRepository.getStudentContext).not.toHaveBeenCalled();
  });

  it('throws StudentNotFoundError when the student does not exist', async () => {
    const { useCase } = buildUseCase({
      contextRepository: {
        getStudentContext: vi.fn().mockResolvedValue(null),
        getPrefilteredCatalog: vi.fn(),
      },
    });

    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'quiero fuerza',
      }),
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('throws EmptyPrefilteredCatalogError when no exercises are compatible with gym inventory', async () => {
    const { useCase } = buildUseCase({
      contextRepository: {
        getStudentContext: vi
          .fn()
          .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
        getPrefilteredCatalog: vi.fn().mockResolvedValue([]),
      },
    });

    await expect(
      useCase.execute({
        studentId,
        requestedByUserId,
        freeText: 'quiero fuerza',
      }),
    ).rejects.toBeInstanceOf(EmptyPrefilteredCatalogError);
  });

  it('creates the request row with minimized context and dispatches only its UUID', async () => {
    const { useCase, generationsRepository, gateway } = buildUseCase({});

    const result = await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
    });

    expect(result).toEqual({
      requestId,
      status: 'queued',
      alreadyExisted: false,
    });

    expect(generationsRepository.findByIdempotencyKey).toHaveBeenCalledWith(
      'generated-key',
    );
    expect(generationsRepository.create).toHaveBeenCalledTimes(1);

    const createdInput = vi.mocked(generationsRepository.create).mock
      .calls[0]?.[0];
    const expectedMinimized = {
      nivel_experiencia: 'intermedio',
      dias_semanales_disponibles: 3,
      objetivos_activos: ['fuerza'],
      condiciones: [],
    };
    const expectedPreferences = {
      texto_libre: 'quiero ganar fuerza',
      parametros: null,
      catalogo_prefiltrado: [
        {
          id: 'ex-1',
          nombre: 'Sentadilla',
          patron_movimiento: 'DOMINANTE_RODILLA',
        },
      ],
    };

    expect(createdInput).toEqual({
      idempotencyKey: 'generated-key',
      minimizedContext: expectedMinimized,
      preferences: expectedPreferences,
      contextHash: hashGenerationInput(expectedMinimized, expectedPreferences),
      retentionUntil: new Date('2026-10-14T00:00:00Z'),
      studentId,
      requestedByUserId,
    });
    expect(JSON.stringify(createdInput?.minimizedContext)).not.toContain(
      studentId,
    );
    expect(JSON.stringify(createdInput?.preferences)).not.toContain(studentId);

    expect(gateway.dispatchGeneration).toHaveBeenCalledTimes(1);
    expect(gateway.dispatchGeneration).toHaveBeenCalledWith(requestId);
  });

  it('uses the caller-supplied idempotencyKey instead of generating one', async () => {
    const { useCase, generationsRepository } = buildUseCase({});

    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      idempotencyKey: 'caller-key',
    });

    expect(generationsRepository.findByIdempotencyKey).toHaveBeenCalledWith(
      'caller-key',
    );
    expect(generationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'caller-key' }),
    );
  });

  it('dispatches again without creating when the key already exists and is not terminal', async () => {
    const { useCase, generationsRepository, gateway } = buildUseCase({
      generationsRepository: {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue({
          requestId,
          idempotencyKey: 'caller-key',
          status: 'PENDIENTE',
        }),
        create: vi.fn(),
      },
    });

    const result = await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      idempotencyKey: 'caller-key',
    });

    expect(result).toEqual({
      requestId,
      status: 'queued',
      alreadyExisted: true,
    });
    expect(generationsRepository.create).not.toHaveBeenCalled();
    expect(gateway.dispatchGeneration).toHaveBeenCalledWith(requestId);
  });

  it('returns the stored status without dispatching when the existing request is terminal', async () => {
    const { useCase, generationsRepository, gateway } = buildUseCase({
      generationsRepository: {
        findById: vi.fn(),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn().mockResolvedValue({
          requestId,
          idempotencyKey: 'caller-key',
          status: 'COMPLETADA',
        }),
        create: vi.fn(),
      },
    });

    const result = await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      idempotencyKey: 'caller-key',
    });

    expect(result).toEqual({
      requestId,
      status: 'COMPLETADA',
      alreadyExisted: true,
    });
    expect(generationsRepository.create).not.toHaveBeenCalled();
    expect(gateway.dispatchGeneration).not.toHaveBeenCalled();
  });

  it('records the student ownership when creating a request', async () => {
    const { useCase, generationsRepository } = buildUseCase({});

    await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
    });

    expect(generationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ studentId, requestedByUserId }),
    );
  });

  it('recovers from a concurrent creation conflict by reusing the winning row', async () => {
    const generationsRepository: RoutineGenerationsRepository = {
      findById: vi.fn(),
      findRequestOwner: vi.fn(),
      findByIdempotencyKey: vi
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          requestId,
          idempotencyKey: 'caller-key',
          status: 'PENDIENTE',
        }),
      create: vi
        .fn()
        .mockRejectedValue(new RoutineGenerationAlreadyExistsError()),
    };
    const { useCase, gateway } = buildUseCase({ generationsRepository });

    const result = await useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      idempotencyKey: 'caller-key',
    });

    expect(result).toEqual({
      requestId,
      status: 'queued',
      alreadyExisted: true,
    });
    expect(gateway.dispatchGeneration).toHaveBeenCalledWith(requestId);
  });

  it('propagates gateway failures with the persisted request reference', async () => {
    const { useCase } = buildUseCase({
      gateway: {
        dispatchGeneration: vi
          .fn()
          .mockRejectedValue(new RoutineGenerationUnavailableError()),
      },
    });

    const result = useCase.execute({
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
    });

    await expect(result).rejects.toMatchObject({
      name: 'RoutineGenerationUnavailableError',
      requestId,
      requestStatus: 'PENDIENTE',
    });
  });
});

describe('hashGenerationInput', () => {
  it('is deterministic and independent of key order', () => {
    const minimized = { b: 2, a: 1 };
    const preferences = { y: [1, 2], x: 't' };

    const first = hashGenerationInput(minimized, preferences);
    const reordered = hashGenerationInput(
      { a: 1, b: 2 },
      { x: 't', y: [1, 2] },
    );

    expect(first).toBe(reordered);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(hashGenerationInput(minimized, { x: 'other', y: [1, 2] })).not.toBe(
      first,
    );
  });
});
