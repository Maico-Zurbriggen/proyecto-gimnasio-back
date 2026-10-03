import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type { StudentMeasurementAccess } from '../../application/ports/student-measurement-access.port';

export class PrismaStudentMeasurementAccess implements StudentMeasurementAccess {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveBlockState(studentId: string) {
    if (!isUuid(studentId)) {
      return null;
    }

    const block = await this.prisma.studentMeasurementBlock.findFirst({
      where: {
        studentId,
        state: { in: ['PENDIENTE_MEDICION', 'PENDIENTE_APROBACION'] },
      },
      select: { state: true },
    });

    if (!block) {
      return null;
    }
    return block.state === 'PENDIENTE_MEDICION'
      ? 'PENDIENTE_MEDICION'
      : 'PENDIENTE_APROBACION';
  }
}
