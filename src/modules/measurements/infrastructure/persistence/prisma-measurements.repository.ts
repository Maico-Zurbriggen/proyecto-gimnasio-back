import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  MeasurementRecord,
  MeasurementsRepository,
  RecordMeasurementCommand,
} from '../../application/ports/measurements.repository';

export class PrismaMeasurementsRepository implements MeasurementsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(
    command: RecordMeasurementCommand,
  ): Promise<MeasurementRecord | null> {
    if (!isUuid(command.studentId)) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.studentProfile.findUnique({
        where: { userId: command.studentId },
        select: { userId: true },
      });
      if (!profile) {
        return null;
      }

      // El indice unico (studentId, type, measuredOn) es el que garantiza que una
      // segunda carga del mismo dia sustituya a la anterior (HU02, Esc. 1).
      const previous = await tx.bodyMeasurement.findUnique({
        where: {
          studentId_type_measuredOn: {
            studentId: command.studentId,
            type: 'PESO_CORPORAL',
            measuredOn: command.measuredOn,
          },
        },
        select: { id: true },
      });

      await tx.bodyMeasurement.upsert({
        where: {
          studentId_type_measuredOn: {
            studentId: command.studentId,
            type: 'PESO_CORPORAL',
            measuredOn: command.measuredOn,
          },
        },
        create: {
          studentId: command.studentId,
          type: 'PESO_CORPORAL',
          value: command.weightKg,
          measuredOn: command.measuredOn,
        },
        update: { value: command.weightKg },
      });

      // La altura no es una medición fechada en el esquema: vive en el perfil.
      await tx.studentProfile.update({
        where: { userId: command.studentId },
        data: { heightCm: command.heightCm },
      });

      return {
        studentId: command.studentId,
        weightKg: command.weightKg,
        heightCm: command.heightCm,
        measuredOn: command.measuredOn,
        replacedPrevious: previous !== null,
      };
    });
  }
}
