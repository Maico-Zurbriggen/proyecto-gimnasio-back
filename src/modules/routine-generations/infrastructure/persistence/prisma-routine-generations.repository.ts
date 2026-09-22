import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  RoutineGenerationOwner,
  RoutineGenerationSnapshot,
  RoutineGenerationsRepository,
} from '../../application/ports/routine-generations.repository';
import { RoutineGenerationOwnershipConflictError } from '../../domain/errors/routine-generation-errors';

export class PrismaRoutineGenerationsRepository implements RoutineGenerationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async registerOwnership(owner: RoutineGenerationOwner): Promise<void> {
    const stored = await this.prisma.routineGenerationOwnership.upsert({
      where: { requestId: owner.requestId },
      create: owner,
      update: {},
    });
    if (
      stored.studentId !== owner.studentId ||
      stored.requestedByUserId !== owner.requestedByUserId
    ) {
      throw new RoutineGenerationOwnershipConflictError();
    }
  }

  async findById(
    owner: RoutineGenerationOwner,
  ): Promise<RoutineGenerationSnapshot | null> {
    const record = await this.prisma.aiGenerationRequest.findUnique({
      where: { id: owner.requestId },
      include: {
        ownership: true,
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: {
            result: {
              include: {
                validations: { orderBy: { validatedAt: 'desc' }, take: 1 },
                routine: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (
      !record ||
      record.ownership?.studentId !== owner.studentId ||
      record.ownership.requestedByUserId !== owner.requestedByUserId
    ) {
      return null;
    }

    const latestAttempt = record.attempts[0];
    const result = latestAttempt?.result;
    const latestValidation = result?.validations[0];
    const violations =
      latestValidation && !latestValidation.valid
        ? this.asViolations(latestValidation.violations)
        : null;

    return {
      requestId: record.id,
      status: violations ? 'NO_DISPONIBLE' : record.state,
      estructuraCandidata: result?.structuredOutput ?? null,
      violaciones: violations,
      error:
        record.state === 'NO_DISPONIBLE'
          ? (latestAttempt?.errorCode ?? 'unknown_error')
          : violations
            ? 'invalid_generated_routine'
            : null,
      routineId: result?.routine?.id ?? null,
    };
  }

  private asViolations(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : ['La validación almacenada no tiene el formato esperado.'];
  }
}
