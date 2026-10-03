import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type { TrainerAssignments } from '../../application/ports/trainer-assignments.port';

export class PrismaTrainerAssignments implements TrainerAssignments {
  constructor(private readonly prisma: PrismaClient) {}

  async isActive(trainerId: string, studentId: string): Promise<boolean> {
    if (!isUuid(trainerId) || !isUuid(studentId)) {
      return false;
    }

    const count = await this.prisma.trainerStudentAssignment.count({
      where: { trainerId, studentId, endsAt: null },
    });
    return count > 0;
  }
}
