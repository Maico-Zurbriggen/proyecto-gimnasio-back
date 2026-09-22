import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { RoutineGenerationAlreadyExistsError } from '../../src/modules/routine-generations/domain/errors/routine-generation-errors';
import { PrismaRoutineGenerationsRepository } from '../../src/modules/routine-generations/infrastructure/persistence/prisma-routine-generations.repository';

const REQUEST_ID = '83271cf7-9264-47b5-b85f-d09f05c99326';
const STUDENT_ID = '11111111-1111-4111-a111-111111111111';
const TRAINER_ID = '33333333-3333-4333-a333-333333333333';

function mockTx() {
  return {
    aiGenerationRequest: {
      create: vi.fn().mockResolvedValue({
        id: REQUEST_ID,
        idempotencyKey: 'key-1',
        state: 'PENDIENTE',
      }),
    },
    routineGenerationOwnership: {
      create: vi.fn().mockResolvedValue({ requestId: REQUEST_ID }),
    },
  };
}

describe('PrismaRoutineGenerationsRepository ownership boundary', () => {
  it('persists identifiers only in app.routine_generation_ownership, never in ai_integration', async () => {
    const tx = mockTx();
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(tx)),
    };
    const repository = new PrismaRoutineGenerationsRepository(prisma as never);

    await repository.create({
      idempotencyKey: 'key-1',
      minimizedContext: { nivel_experiencia: 'intermedio' },
      preferences: { texto_libre: 'quiero ganar fuerza' },
      contextHash: 'hash-1',
      retentionUntil: new Date('2026-10-14T00:00:00Z'),
      studentId: STUDENT_ID,
      requestedByUserId: TRAINER_ID,
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const aiData = vi.mocked(tx.aiGenerationRequest.create).mock.calls[0]?.[0];
    expect(JSON.stringify(aiData)).not.toContain(STUDENT_ID);
    expect(JSON.stringify(aiData)).not.toContain(TRAINER_ID);
    expect(tx.routineGenerationOwnership.create).toHaveBeenCalledWith({
      data: {
        requestId: REQUEST_ID,
        studentId: STUDENT_ID,
        requestedByUserId: TRAINER_ID,
      },
    });
  });

  it('maps idempotency conflicts to RoutineGenerationAlreadyExistsError', async () => {
    const prisma = {
      $transaction: vi.fn().mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      ),
    };
    const repository = new PrismaRoutineGenerationsRepository(prisma as never);

    await expect(
      repository.create({
        idempotencyKey: 'key-1',
        minimizedContext: {},
        preferences: {},
        contextHash: 'hash-1',
        retentionUntil: new Date('2026-10-14T00:00:00Z'),
        studentId: STUDENT_ID,
        requestedByUserId: TRAINER_ID,
      }),
    ).rejects.toBeInstanceOf(RoutineGenerationAlreadyExistsError);
  });

  it('resolves the owning student of a request', async () => {
    const prisma = {
      routineGenerationOwnership: {
        findUnique: vi.fn().mockResolvedValue({ studentId: STUDENT_ID }),
      },
    };
    const repository = new PrismaRoutineGenerationsRepository(prisma as never);

    await expect(repository.findRequestOwner(REQUEST_ID)).resolves.toEqual({
      studentId: STUDENT_ID,
    });
    expect(prisma.routineGenerationOwnership.findUnique).toHaveBeenCalledWith({
      where: { requestId: REQUEST_ID },
    });
  });

  it('returns null when a request has no recorded owner', async () => {
    const prisma = {
      routineGenerationOwnership: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const repository = new PrismaRoutineGenerationsRepository(prisma as never);

    await expect(repository.findRequestOwner(REQUEST_ID)).resolves.toBeNull();
  });
});
