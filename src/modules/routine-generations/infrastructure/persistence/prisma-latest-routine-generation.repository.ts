import type { PrismaClient } from '@prisma/client';

import type { LatestRoutineGenerationRepository } from '../../application/ports/latest-routine-generation.repository';
import type {
  RoutineGenerationSnapshot,
  RoutineGenerationsRepository,
} from '../../application/ports/routine-generations.repository';

export class PrismaLatestRoutineGenerationRepository implements LatestRoutineGenerationRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly generationsRepository: RoutineGenerationsRepository,
  ) {}

  async findLatestByStudentId(
    studentId: string,
  ): Promise<RoutineGenerationSnapshot | null> {
    const ownership = await this.prisma.routineGenerationOwnership.findFirst({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      select: { requestId: true },
    });

    if (!ownership) {
      return null;
    }

    return this.generationsRepository.findById(ownership.requestId);
  }
}
