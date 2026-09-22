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
  const generationsRepository: RoutineGenerationsRepository = {
    registerOwnership: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn(),
  };

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

  it('throws MissingGenerationInputError when neither freeText nor parameters are provided', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi.fn(),
      getPrefilteredCatalog: vi.fn(),
    };
    const gateway: RoutineGenerationGateway = {
      requestGeneration: vi.fn(),
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
    const gateway: RoutineGenerationGateway = { requestGeneration: vi.fn() };

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
    ).rejects.toBeInstanceOf(StudentNotFoundError);
  });

  it('throws EmptyPrefilteredCatalogError when no exercises are compatible with gym inventory', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue([]),
    };
    const gateway: RoutineGenerationGateway = { requestGeneration: vi.fn() };

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
  });

  it('generates an idempotency key and calls the gateway with the built payload', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
    };
    const gateway: RoutineGenerationGateway = {
      requestGeneration: vi.fn().mockResolvedValue({
        requestId: 'req-1',
        status: 'pending',
        alreadyExisted: false,
      }),
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
      status: 'pending',
      alreadyExisted: false,
    });
    expect(gateway.requestGeneration).toHaveBeenCalledWith({
      idempotencyKey: 'generated-key',
      gymId: 'gym-1',
      studentId,
      requestedByUserId,
      freeText: 'quiero ganar fuerza',
      parameters: null,
      prefilteredCatalog: catalog,
      minimizedContext,
    });
    expect(contextRepository.getPrefilteredCatalog).toHaveBeenCalledWith(
      studentId,
      'gym-1',
      fixedNow,
    );
  });

  it('uses the caller-supplied idempotencyKey instead of generating one', async () => {
    const contextRepository: GenerationContextRepository = {
      getStudentContext: vi
        .fn()
        .mockResolvedValue({ gymId: 'gym-1', minimizedContext }),
      getPrefilteredCatalog: vi.fn().mockResolvedValue(catalog),
    };
    const gateway: RoutineGenerationGateway = {
      requestGeneration: vi.fn().mockResolvedValue({
        requestId: 'req-1',
        status: 'pending',
        alreadyExisted: true,
      }),
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

    expect(gateway.requestGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'caller-key' }),
    );
  });
});
