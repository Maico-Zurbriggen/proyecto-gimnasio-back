import { Prisma, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import type { CreateRoutineGenerationRequest } from '../../application/ports/routine-generations.repository';
import { RoutineGenerationIdempotencyConflictError } from '../../domain/errors/routine-generation-errors';
import { PrismaRoutineGenerationsRepository } from './prisma-routine-generations.repository';

const input: CreateRoutineGenerationRequest = {
  idempotencyKey: 'request-key',
  minimizedContext: {
    nivelExperiencia: 'intermedio',
    diasSemanalesDisponibles: 3,
    objetivosActivos: ['fuerza'],
    condiciones: [],
  },
  preferences: {
    free_text: 'Quiero ganar fuerza',
    parameters: null,
    allowed_catalog: [
      {
        id: 'exercise-1',
        name: 'Sentadilla',
        movement_pattern: 'DOMINANTE_RODILLA',
      },
    ],
  },
  retentionUntil: new Date('2026-10-14T00:00:00Z'),
};

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('duplicate key', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: ['idempotency_key'] },
  });
}

describe('PrismaRoutineGenerationsRepository.createOrGetRequest', () => {
  it('persists a minimal request and returns its generated UUID', async () => {
    const create = vi.fn().mockResolvedValue({
      id: '83271cf7-9264-47b5-b85f-d09f05c99326',
      state: 'PENDIENTE',
    });
    const repository = new PrismaRoutineGenerationsRepository({
      aiGenerationRequest: { create },
    } as unknown as PrismaClient);

    const result = await repository.createOrGetRequest(input);

    expect(result).toEqual({
      requestId: '83271cf7-9264-47b5-b85f-d09f05c99326',
      status: 'PENDIENTE',
      alreadyExisted: false,
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        idempotencyKey: 'request-key',
        minimizedContext: expect.objectContaining({
          experience_level: 'intermedio',
          available_days_per_week: 3,
          active_goals: ['fuerza'],
          conditions: [],
          schema_version: '2.0',
        }),
        preferences: { ...input.preferences, schema_version: '2.0' },
        contextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        retentionUntil: input.retentionUntil,
      }),
      select: { id: true, state: true },
    });
  });

  it('returns the existing request when the idempotency key and payload match', async () => {
    const findUnique = vi.fn();
    const create = vi.fn(
      async ({ data }: { data: { contextHash: string } }) => {
        findUnique.mockResolvedValue({
          id: '83271cf7-9264-47b5-b85f-d09f05c99326',
          state: 'PROCESANDO',
          contextHash: data.contextHash,
        });
        throw uniqueConstraintError();
      },
    );
    const repository = new PrismaRoutineGenerationsRepository({
      aiGenerationRequest: { create, findUnique },
    } as unknown as PrismaClient);

    const result = await repository.createOrGetRequest(input);

    expect(result).toEqual({
      requestId: '83271cf7-9264-47b5-b85f-d09f05c99326',
      status: 'PROCESANDO',
      alreadyExisted: true,
    });
  });

  it('rejects reuse of an idempotency key with a different payload', async () => {
    const repository = new PrismaRoutineGenerationsRepository({
      aiGenerationRequest: {
        create: vi.fn().mockRejectedValue(uniqueConstraintError()),
        findUnique: vi.fn().mockResolvedValue({
          id: '83271cf7-9264-47b5-b85f-d09f05c99326',
          state: 'PENDIENTE',
          contextHash: 'different-hash',
        }),
      },
    } as unknown as PrismaClient);

    await expect(repository.createOrGetRequest(input)).rejects.toBeInstanceOf(
      RoutineGenerationIdempotencyConflictError,
    );
  });

  it('keeps regeneration idempotent after the server replacement target changes', async () => {
    const findUnique = vi.fn();
    let storedHash: string | undefined;
    const create = vi.fn(
      async ({ data }: { data: { contextHash: string } }) => {
        if (!storedHash) {
          storedHash = data.contextHash;
          return { id: 'request', state: 'PENDIENTE' };
        }
        findUnique.mockResolvedValue({
          id: 'request',
          state: 'COMPLETADA',
          contextHash: storedHash,
        });
        throw uniqueConstraintError();
      },
    );
    const repository = new PrismaRoutineGenerationsRepository({
      aiGenerationRequest: { create, findUnique },
    } as unknown as PrismaClient);
    await repository.createOrGetRequest({
      ...input,
      preferences: {
        ...input.preferences,
        local_test_regeneration: { replaces_proposed_routine_id: 'old' },
      },
    });
    const reused = await repository.createOrGetRequest({
      ...input,
      preferences: {
        ...input.preferences,
        local_test_regeneration: { replaces_proposed_routine_id: 'new' },
      },
    });
    expect(reused.alreadyExisted).toBe(true);
    await expect(repository.createOrGetRequest(input)).rejects.toBeInstanceOf(
      RoutineGenerationIdempotencyConflictError,
    );
  });
});
