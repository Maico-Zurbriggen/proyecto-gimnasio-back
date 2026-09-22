import { Prisma, type PrismaClient } from '@prisma/client';

import { RoutineGenerationAlreadyExistsError } from '../../domain/errors/routine-generation-errors';
import type {
  CreateGenerationRequestInput,
  GenerationRequestOwner,
  GenerationRequestRecord,
  RoutineGenerationSnapshot,
  RoutineGenerationsRepository,
} from '../../application/ports/routine-generations.repository';

export class PrismaRoutineGenerationsRepository implements RoutineGenerationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(requestId: string): Promise<RoutineGenerationSnapshot | null> {
    const record = await this.prisma.aiGenerationRequest.findUnique({
      where: { id: requestId },
      include: {
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: {
            result: {
              include: {
                validations: {
                  orderBy: { validatedAt: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    if (!record) {
      return null;
    }

    const latestAttempt = record.attempts[0];
    const latestValidation = latestAttempt?.result?.validations[0];
    const violations =
      latestValidation && !latestValidation.valid
        ? (latestValidation.violations as string[])
        : null;

    return {
      requestId: record.id,
      status: record.state,
      estructuraCandidata: latestAttempt?.result?.structuredOutput ?? null,
      violaciones: violations,
      error:
        record.state === 'NO_DISPONIBLE'
          ? (latestAttempt?.errorCode ?? 'unknown_error')
          : null,
    };
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<GenerationRequestRecord | null> {
    const record = await this.prisma.aiGenerationRequest.findUnique({
      where: { idempotencyKey },
    });

    if (!record) {
      return null;
    }

    return {
      requestId: record.id,
      idempotencyKey: record.idempotencyKey,
      status: record.state,
    };
  }

  async create(
    input: CreateGenerationRequestInput,
  ): Promise<GenerationRequestRecord> {
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const created = await tx.aiGenerationRequest.create({
          data: {
            idempotencyKey: input.idempotencyKey,
            minimizedContext: input.minimizedContext as Prisma.InputJsonValue,
            preferences: input.preferences as Prisma.InputJsonValue,
            contextHash: input.contextHash,
            retentionUntil: input.retentionUntil,
          },
        });
        await tx.routineGenerationOwnership.create({
          data: {
            requestId: created.id,
            studentId: input.studentId,
            requestedByUserId: input.requestedByUserId,
          },
        });
        return created;
      });

      return {
        requestId: record.id,
        idempotencyKey: record.idempotencyKey,
        status: record.state,
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new RoutineGenerationAlreadyExistsError(
          `Generation request with idempotency key ${input.idempotencyKey} already exists`,
        );
      }

      throw error;
    }
  }

  async findRequestOwner(
    requestId: string,
  ): Promise<GenerationRequestOwner | null> {
    const row = await this.prisma.routineGenerationOwnership.findUnique({
      where: { requestId },
    });

    if (!row) {
      return null;
    }

    return { studentId: row.studentId };
  }
}
