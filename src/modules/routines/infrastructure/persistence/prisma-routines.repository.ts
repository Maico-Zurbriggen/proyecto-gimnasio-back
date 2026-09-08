import type { PrismaClient } from '@prisma/client';

import type { RoutinesRepository } from '../../application/ports/routines.repository';
import { Routine } from '../../domain/entities/routine.entity';

export class PrismaRoutinesRepository implements RoutinesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findActiveByStudentId(studentId: string): Promise<Routine | null> {
    const record = await this.prisma.routine.findFirst({
      where: {
        studentId,
        state: 'VIGENTE',
      },
      include: {
        reviews: {
          where: {
            result: {
              in: ['APROBADA', 'APROBADA_CON_CAMBIOS'],
            },
          },
          orderBy: {
            reviewedAt: 'desc',
          },
          take: 1,
        },
        versions: {
          where: {
            current: true,
          },
          take: 1,
        },
      },
    });

    if (!record) {
      return null;
    }

    // La fecha de inicio del ciclo activo corresponde a la fecha de la revisión favorable (puesta en vigencia).
    // Si no existiera revisión registrada, se toma la creación de la versión actual o el requestedAt.
    const favorableReview = record.reviews[0];
    const currentVersion = record.versions[0];
    const startDate =
      favorableReview?.reviewedAt ??
      currentVersion?.createdAt ??
      record.requestedAt;

    return new Routine({
      id: record.id,
      studentId: record.studentId,
      routineType: record.routineType,
      targetWeeklyFrequency: record.targetWeeklyFrequency,
      state: record.state,
      origin: record.origin,
      startDate,
      currentVersionNumber: currentVersion?.versionNumber,
    });
  }
}

