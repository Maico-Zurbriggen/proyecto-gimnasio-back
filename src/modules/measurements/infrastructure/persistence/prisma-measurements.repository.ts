import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import { MeasurementRegularizationAlreadySubmittedError } from '../../domain/errors/measurement-errors';
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

      const activeBlock = await tx.studentMeasurementBlock.findFirst({
        where: {
          studentId: command.studentId,
          state: { in: ['PENDIENTE_MEDICION', 'PENDIENTE_APROBACION'] },
        },
        orderBy: { blockedAt: 'desc' },
        select: { id: true, state: true },
      });
      if (activeBlock?.state === 'PENDIENTE_APROBACION') {
        throw new MeasurementRegularizationAlreadySubmittedError();
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

      const weightMeasurement = await tx.bodyMeasurement.upsert({
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
        select: { id: true },
      });

      // La altura no es una medición fechada en el esquema: vive en el perfil.
      await tx.studentProfile.update({
        where: { userId: command.studentId },
        data: {
          heightCm: command.heightCm,
          heightUpdatedAt: command.recordedAt,
        },
      });

      let measurementBlockState: 'NORMAL' | 'PENDIENTE_APROBACION' = 'NORMAL';
      if (activeBlock?.state === 'PENDIENTE_MEDICION') {
        const submitted = await tx.studentMeasurementBlock.updateMany({
          where: { id: activeBlock.id, state: 'PENDIENTE_MEDICION' },
          data: {
            state: 'PENDIENTE_APROBACION',
            regularizationWeightMeasurementId: weightMeasurement.id,
            regularizationHeightConfirmedAt: command.recordedAt,
            submittedAt: command.recordedAt,
          },
        });
        if (submitted.count === 0) {
          throw new MeasurementRegularizationAlreadySubmittedError();
        }
        measurementBlockState = 'PENDIENTE_APROBACION';
      }

      return {
        studentId: command.studentId,
        weightKg: command.weightKg,
        heightCm: command.heightCm,
        measuredOn: command.measuredOn,
        replacedPrevious: previous !== null,
        measurementBlockState,
      };
    });
  }
}
