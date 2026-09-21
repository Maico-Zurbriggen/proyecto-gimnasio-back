import type { PrismaClient } from '@prisma/client';

import type {
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
}
