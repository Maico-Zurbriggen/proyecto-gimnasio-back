import type { Prisma, PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  AssignedStudentRecord,
  StudentRecord,
  StudentsRepository,
  UnlockStudentCommand,
} from '../../application/ports/students.repository';

const studentInclude = {
  user: { select: { displayName: true, createdAt: true } },
  bodyMeasurements: {
    select: { measuredOn: true },
    orderBy: { measuredOn: 'desc' },
    take: 1,
  },
  measurementBlocks: {
    orderBy: { blockedAt: 'desc' },
  },
  measurementCheckpoints: {
    select: { result: true, evaluatedAt: true },
    orderBy: { dueOn: 'desc' },
  },
} satisfies Prisma.StudentProfileInclude;

type StudentRow = Prisma.StudentProfileGetPayload<{
  include: typeof studentInclude;
}>;

function toRecord(row: StudentRow): StudentRecord {
  const activeBlock = row.measurementBlocks.find(
    ({ state }) => state !== 'RESUELTO',
  );
  const latestResolution = row.measurementBlocks.find(
    ({ state }) => state === 'RESUELTO',
  )?.approvedAt;

  return {
    id: row.userId,
    displayName: row.user.displayName,
    registeredAt: row.user.createdAt,
    heightCm: Number(row.heightCm),
    lastMeasurementOn: row.bodyMeasurements[0]?.measuredOn ?? null,
    activeMeasurementBlock: activeBlock
      ? {
          state:
            activeBlock.state === 'PENDIENTE_MEDICION'
              ? 'PENDIENTE_MEDICION'
              : 'PENDIENTE_APROBACION',
          reason: activeBlock.reason,
          consecutiveMissesAtBlock: activeBlock.consecutiveMissesAtBlock,
          blockedAt: activeBlock.blockedAt,
          submittedAt: activeBlock.submittedAt,
        }
      : null,
    checkpointResults: row.measurementCheckpoints
      .filter(
        ({ evaluatedAt }) =>
          !latestResolution || evaluatedAt > latestResolution,
      )
      .map(({ result }) => result),
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
          select: {
            routines: { where: { state: 'PROPUESTA' } },
            adaptationProposals: { where: { state: 'PENDIENTE' } },
          },
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
        pendingRoutineReviews: row._count.routines,
        pendingAdaptationProposals: row._count.adaptationProposals,
      };
    });
  }

  async unlock(command: UnlockStudentCommand) {
    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.trainerStudentAssignment.findFirst({
        where: {
          studentId: command.studentId,
          trainerId: command.trainerId,
          startsAt: { lte: command.approvedAt },
          OR: [{ endsAt: null }, { endsAt: { gt: command.approvedAt } }],
        },
        select: { id: true },
      });
      if (!assignment) {
        return 'NOT_ASSIGNED' as const;
      }

      const block = await tx.studentMeasurementBlock.findFirst({
        where: {
          studentId: command.studentId,
          state: { in: ['PENDIENTE_MEDICION', 'PENDIENTE_APROBACION'] },
        },
        orderBy: { blockedAt: 'desc' },
        select: { id: true, state: true, submittedAt: true },
      });
      if (!block) {
        return 'NOT_BLOCKED' as const;
      }
      if (block.state === 'PENDIENTE_MEDICION') {
        return 'PENDING_MEASUREMENT' as const;
      }

      const approved = await tx.studentMeasurementBlock.updateMany({
        where: { id: block.id, state: 'PENDIENTE_APROBACION' },
        data: {
          state: 'RESUELTO',
          approvedByTrainerId: command.trainerId,
          approvedAt: command.approvedAt,
        },
      });
      if (approved.count === 0) {
        return 'ALREADY_RESOLVED' as const;
      }

      await tx.auditLog.create({
        data: {
          actorUserId: command.trainerId,
          operation: 'APROBACION_REGULARIZACION_MEDICIONES',
          entityType: 'STUDENT_MEASUREMENT_BLOCK',
          entityId: block.id,
          previousValue: {
            state: 'PENDIENTE_APROBACION',
            submittedAt: block.submittedAt?.toISOString() ?? null,
          },
          newValue: {
            state: 'RESUELTO',
            approvedByTrainerId: command.trainerId,
            approvedAt: command.approvedAt.toISOString(),
          },
        },
      });

      return 'APPROVED' as const;
    });
  }
}
