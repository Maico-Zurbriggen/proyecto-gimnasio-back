import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../shared/types/uuid';
import type {
  AssignTrainerResult,
  AssignmentsRepository,
  StudentAssignmentRecord,
  TrainerOptionRecord,
} from '../application/assignments';

/** Asignación vigente en un instante dado. */
function vigenteEn(now: Date) {
  return {
    startsAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export class PrismaAssignmentsRepository implements AssignmentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listStudents(gymId: string): Promise<StudentAssignmentRecord[]> {
    const now = new Date();
    const students = await this.prisma.studentProfile.findMany({
      where: { user: { gymId, state: 'ACTIVO' } },
      orderBy: { user: { displayName: 'asc' } },
      select: {
        userId: true,
        user: { select: { displayName: true, emailNormalized: true } },
        trainerAssignments: {
          where: vigenteEn(now),
          orderBy: { startsAt: 'desc' },
          take: 1,
          select: {
            startsAt: true,
            trainer: {
              select: { user: { select: { id: true, displayName: true } } },
            },
          },
        },
      },
    });

    return students.map((student) => {
      const assignment = student.trainerAssignments[0];
      return {
        studentId: student.userId,
        displayName: student.user.displayName,
        email: student.user.emailNormalized,
        trainer: assignment
          ? {
              id: assignment.trainer.user.id,
              displayName: assignment.trainer.user.displayName,
            }
          : null,
        assignedAt: assignment?.startsAt ?? null,
      };
    });
  }

  async listTrainers(gymId: string): Promise<TrainerOptionRecord[]> {
    const now = new Date();
    const trainers = await this.prisma.trainerProfile.findMany({
      where: {
        user: {
          gymId,
          state: 'ACTIVO',
          roles: { some: { role: 'ENTRENADOR' } },
        },
      },
      orderBy: { user: { displayName: 'asc' } },
      select: {
        userId: true,
        user: { select: { displayName: true } },
        _count: { select: { studentAssignments: { where: vigenteEn(now) } } },
      },
    });
    return trainers.map((trainer) => ({
      id: trainer.userId,
      displayName: trainer.user.displayName,
      studentCount: trainer._count.studentAssignments,
    }));
  }

  async assign(input: {
    gymId: string;
    actorUserId: string;
    studentId: string;
    trainerId: string;
  }): Promise<
    AssignTrainerResult | 'ALUMNO_INEXISTENTE' | 'ENTRENADOR_INVALIDO'
  > {
    if (!isUuid(input.studentId)) return 'ALUMNO_INEXISTENTE';
    if (!isUuid(input.trainerId)) return 'ENTRENADOR_INVALIDO';

    return this.prisma.$transaction(async (tx) => {
      // Serializa los cambios de asignación del alumno y comparte el bloqueo con
      // la revisión de rutinas y el cambio de objetivo.
      const locked = await tx.$queryRaw<Array<{ user_id: string }>>`
        SELECT sp.user_id FROM app.student_profiles sp
        JOIN app.users u ON u.id = sp.user_id
        WHERE sp.user_id = ${input.studentId}::uuid
          AND u.gym_id = ${input.gymId}::uuid
          AND u.state = 'ACTIVO'
        FOR UPDATE OF sp`;
      if (locked.length === 0) return 'ALUMNO_INEXISTENTE' as const;

      const trainer = await tx.trainerProfile.findFirst({
        where: {
          userId: input.trainerId,
          user: {
            gymId: input.gymId,
            state: 'ACTIVO',
            roles: { some: { role: 'ENTRENADOR' } },
          },
        },
        select: { userId: true, user: { select: { displayName: true } } },
      });
      if (!trainer) return 'ENTRENADOR_INVALIDO' as const;

      // Reloj de la base: el trigger de revisión compara contra now() de la
      // base, así que la asignación nace con ese mismo reloj.
      const clock = await tx.$queryRaw<Array<{ now: Date }>>`
        SELECT clock_timestamp() AS now`;
      const now = clock[0]!.now;

      const current = await tx.trainerStudentAssignment.findFirst({
        where: { studentId: input.studentId, ...vigenteEn(now) },
        orderBy: { startsAt: 'desc' },
        select: { id: true, trainerId: true },
      });

      let previousTrainerId: string | null = null;
      if (current?.trainerId !== input.trainerId) {
        if (current) {
          previousTrainerId = current.trainerId;
          await tx.trainerStudentAssignment.update({
            where: { id: current.id },
            data: { endsAt: now, endedByUserId: input.actorUserId },
          });
        }
        await tx.trainerStudentAssignment.create({
          data: {
            studentId: input.studentId,
            trainerId: input.trainerId,
            startsAt: now,
            startedByUserId: input.actorUserId,
          },
        });
      }

      // RF-109 / RF-112: lo bloqueado por falta de entrenador pasa a su bandeja.
      const routines = await tx.routine.updateMany({
        where: { studentId: input.studentId, state: 'BLOQUEADA' },
        data: { state: 'PROPUESTA' },
      });
      const proposals = await tx.adaptationProposal.updateMany({
        where: { studentId: input.studentId, state: 'BLOQUEADA' },
        data: { state: 'PENDIENTE' },
      });

      // RN-108: altas y bajas de asignación quedan en auditoría.
      await tx.auditLog.create({
        data: {
          actorUserId: input.actorUserId,
          operation: 'ASIGNACION_ENTRENADOR',
          entityType: 'STUDENT',
          entityId: input.studentId,
          previousValue: {
            entrenador: previousTrainerId ?? current?.trainerId ?? null,
          },
          newValue: {
            entrenador: input.trainerId,
            rutinasDesbloqueadas: routines.count,
            propuestasDesbloqueadas: proposals.count,
          },
        },
      });

      return {
        studentId: input.studentId,
        trainer: { id: trainer.userId, displayName: trainer.user.displayName },
        previousTrainerId,
        unblockedRoutines: routines.count,
        unblockedProposals: proposals.count,
      };
    });
  }
}
