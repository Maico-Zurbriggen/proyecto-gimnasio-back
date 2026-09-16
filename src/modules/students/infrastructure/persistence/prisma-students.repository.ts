import type { Prisma, PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  AssignedStudentRecord,
  StudentRecord,
  StudentsRepository,
  UnlockStudentCommand,
} from '../../application/ports/students.repository';

const studentInclude = {
  user: { select: { displayName: true, state: true, createdAt: true } },
  bodyMeasurements: {
    select: { measuredOn: true },
    orderBy: { measuredOn: 'desc' },
    take: 1,
  },
} satisfies Prisma.StudentProfileInclude;

type StudentRow = Prisma.StudentProfileGetPayload<{
  include: typeof studentInclude;
}>;

function toRecord(row: StudentRow): StudentRecord {
  return {
    id: row.userId,
    displayName: row.user.displayName,
    state: row.user.state,
    registeredAt: row.user.createdAt,
    heightCm: Number(row.heightCm),
    lastMeasurementOn: row.bodyMeasurements[0]?.measuredOn ?? null,
  };
}

export class PrismaStudentsRepository implements StudentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(studentId: string): Promise<StudentRecord | null> {
    if (!isUuid(studentId)) {
      return null;
    }

    const row = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: studentInclude,
    });
    return row ? toRecord(row) : null;
  }

  async findAssignedToTrainer(
    trainerId: string,
  ): Promise<AssignedStudentRecord[]> {
    if (!isUuid(trainerId)) {
      return [];
    }

    const rows = await this.prisma.studentProfile.findMany({
      where: { trainerAssignments: { some: { trainerId, endsAt: null } } },
      include: {
        ...studentInclude,
        goals: {
          where: { endsOn: null },
          orderBy: { startsOn: 'desc' },
          take: 1,
        },
        routines: {
          where: { state: 'VIGENTE' },
          take: 1,
          include: {
            reviews: {
              where: { result: { in: ['APROBADA', 'APROBADA_CON_CAMBIOS'] } },
              orderBy: { reviewedAt: 'desc' },
              take: 1,
            },
            versions: { where: { current: true }, take: 1 },
          },
        },
        _count: {
          select: { adaptationProposals: { where: { state: 'PENDIENTE' } } },
        },
      },
    });

    return rows.map((row) => {
      const routine = row.routines[0];
      return {
        ...toRecord(row),
        goal: row.goals[0]?.type ?? null,
        // Mismo criterio que la rutina vigente: el ciclo arranca con la revisión favorable.
        activeRoutine: routine
          ? {
              routineType: routine.routineType,
              cycleStart:
                routine.reviews[0]?.reviewedAt ??
                routine.versions[0]?.createdAt ??
                routine.requestedAt,
            }
          : null,
        pendingProposals: row._count.adaptationProposals,
      };
    });
  }

  async unlock(command: UnlockStudentCommand): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const reactivated = await tx.user.updateMany({
        where: { id: command.studentId, state: 'SUSPENDIDO' },
        data: { state: 'ACTIVO' },
      });
      if (reactivated.count === 0) {
        return false;
      }

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

      await tx.auditLog.create({
        data: {
          actorUserId: command.trainerId,
          operation: 'DESBLOQUEO_ALUMNO',
          entityType: 'USER',
          entityId: command.studentId,
          previousValue: { state: 'SUSPENDIDO' },
          newValue: {
            state: 'ACTIVO',
            pesoKg: command.weightKg,
            alturaCm: command.heightCm,
            medidoEl: command.measuredOn.toISOString().slice(0, 10),
          },
        },
      });

      return true;
    });
  }
}
