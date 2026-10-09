import type { PrismaClient, Prisma } from '@prisma/client';
import type { AuthUser } from '../../../../shared/types/auth';
import type { TrainingPurpose } from '../../../prescriptions/application/ports/prescriptions.repository';
import type {
  GoalsRepository,
  GoalRecord,
} from '../../application/ports/goals.repository';
import {
  purposeSchemes,
  requiresGoalConfirmation,
} from '../../domain/goal-policy';
import { goalContext } from '../../domain/context-policy';

const goalSelect = {
  id: true,
  type: true,
  startsOn: true,
  endsOn: true,
} as const;

export class PrismaGoalsRepository implements GoalsRepository {
  constructor(private readonly prisma: PrismaClient) {}
  private async authorized(
    tx: Prisma.TransactionClient,
    actor: AuthUser,
    studentId: string,
  ): Promise<boolean> {
    if (actor.id === studentId && actor.roles.includes('ALUMNO')) return true;
    if (!actor.roles.includes('ENTRENADOR')) return false;
    const assignments = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT a.id FROM app.trainer_student_assignments a
      JOIN app.users trainer ON trainer.id = a.trainer_id
      JOIN app.users student ON student.id = a.student_id
      WHERE a.trainer_id = ${actor.id}::uuid AND a.student_id = ${studentId}::uuid
        AND trainer.gym_id = ${actor.gymId}::uuid AND student.gym_id = trainer.gym_id
        AND a.starts_at <= clock_timestamp() AND (a.ends_at IS NULL OR a.ends_at > clock_timestamp())`;
    return assignments.length > 0;
  }
  async read(actor: AuthUser, studentId: string, at?: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await this.authorized(tx, actor, studentId))) return null;
      const student = await tx.studentProfile.findFirst({
        where: { userId: studentId, user: { gymId: actor.gymId } },
        include: {
          user: { include: { gym: true } },
          goals: { select: goalSelect, orderBy: { startsOn: 'asc' } },
        },
      });
      if (!student) return null;
      const now = new Date();
      const current =
        student.goals.find(
          (goal) => goal.startsOn <= now && goal.endsOn === null,
        ) ?? null;
      let atDate: GoalRecord | null = null;
      if (at) {
        // Fecha sin hora: comienzo del día en la zona del gimnasio (DST incluido).
        const times = await tx.$queryRaw<
          Array<{ instant: Date }>
        >`SELECT CASE WHEN length(${at}) = 10 THEN ${at}::timestamp AT TIME ZONE ${student.user.gym.timezone} ELSE ${at}::timestamptz END AS instant`;
        const instant = times[0]!.instant;
        atDate =
          student.goals.find(
            (goal) =>
              goal.startsOn <= instant &&
              (goal.endsOn === null || goal.endsOn > instant),
          ) ?? null;
      }
      // Este módulo integra el objetivo con el contexto ya modelado, sin
      // inferir valores para alumnos que todavía no declararon un objetivo.
      const context = goalContext({
        objective: current?.type ?? null,
        experienceLevel: student.experienceLevel,
        availableDaysPerWeek: student.availableDaysPerWeek,
      });
      if (!(await this.authorized(tx, actor, studentId))) return null;
      return {
        timezone: student.user.gym.timezone,
        current,
        history: student.goals,
        atDate,
        context,
      };
    });
  }
  async declare(actor: AuthUser, type: TrainingPurpose) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${actor.id}::uuid FOR UPDATE`;
        const student = await tx.studentProfile.findFirst({
          where: {
            userId: actor.id,
            user: { gymId: actor.gymId, state: 'ACTIVO' },
          },
          include: { user: { include: { gym: true } } },
        });
        if (!student) return null;
        const previous = await tx.goal.findFirst({
          where: { studentId: actor.id, endsOn: null },
          select: goalSelect,
        });
        if (previous?.type === type)
          return {
            goal: previous,
            changed: false,
            timezone: student.user.gym.timezone,
          };
        const times = await tx.$queryRaw<
          Array<{ now: Date }>
        >`SELECT clock_timestamp() AS now`;
        // Prisma expone milisegundos; preserva un período positivo aun en cambios
        // consecutivos dentro del mismo milisegundo.
        const now = new Date(
          Math.max(
            times[0]!.now.getTime(),
            (previous?.startsOn.getTime() ?? 0) + 1,
          ),
        );
        if (previous)
          await tx.goal.update({
            where: { id: previous.id },
            data: { endsOn: now },
          });
        const goal = await tx.goal.create({
          data: { studentId: actor.id, type, startsOn: now },
          select: goalSelect,
        });
        await this.reevaluate(
          tx,
          actor.id,
          goal,
          previous?.type ?? null,
          student.user.gym.timezone,
        );
        return { goal, changed: true, timezone: student.user.gym.timezone };
      },
      { timeout: 20000 },
    );
  }

  private async reevaluate(
    tx: Prisma.TransactionClient,
    studentId: string,
    goal: GoalRecord,
    previous: TrainingPurpose | null,
    timezone: string,
  ) {
    const routine = await tx.routine.findFirst({
      where: { studentId, state: 'VIGENTE' },
      include: {
        versions: {
          where: { current: true },
          include: {
            days: { include: { exercises: { include: { sets: true } } } },
          },
        },
      },
    });
    if (!routine || !routine.versions[0]) return;
    const version = routine.versions[0];
    await tx.auditLog.create({
      data: {
        actorUserId: studentId,
        operation: 'REEVALUACION_CAMBIO_OBJETIVO',
        entityType: 'ROUTINE',
        entityId: routine.id,
        previousValue: { objetivo: previous },
        newValue: { objetivo: goal.type, goalId: goal.id },
        createdAt: goal.startsOn,
      },
    });
    // Reemplaza sólo propuestas originadas por un objetivo ahora superado.
    await tx.adaptationProposal.updateMany({
      where: {
        studentId,
        state: { in: ['PENDIENTE', 'BLOQUEADA'] },
        componentVersion: 'goal-context-v1',
      },
      data: {
        state: 'INVALIDADA',
        resolvedAt: goal.startsOn,
        resolutionReason: 'El objetivo vigente cambió.',
      },
    });
    if (!requiresGoalConfirmation(routine.routineType, goal.type)) return;
    const dayRows = await tx.$queryRaw<
      Array<{ day: Date }>
    >`SELECT ( ${goal.startsOn}::timestamptz AT TIME ZONE ${timezone} )::date AS day`;
    const diagnostic = await tx.evolutionDiagnostic.create({
      data: {
        studentId,
        routineVersionId: version.id,
        periodStart: dayRows[0]!.day,
        periodEnd: dayRows[0]!.day,
        globalSituation: 'DATOS_INSUFICIENTES',
        componentVersion: 'goal-context-v1',
        criteriaNotEvaluated: ['rendimiento'],
        calculatedAt: goal.startsOn,
      },
    });
    const assignment = await tx.trainerStudentAssignment.findFirst({
      where: {
        studentId,
        startsAt: { lte: goal.startsOn },
        OR: [{ endsAt: null }, { endsAt: { gt: goal.startsOn } }],
      },
    });
    const scheme = purposeSchemes[goal.type];
    const proposal = await tx.adaptationProposal.create({
      data: {
        diagnosticId: diagnostic.id,
        studentId,
        state: assignment ? 'PENDIENTE' : 'BLOQUEADA',
        componentVersion: 'goal-context-v1',
        createdAt: goal.startsOn,
        adjustments: {
          create: [
            {
              type: 'ESTRUCTURA',
              previousValue: { routine_type: routine.routineType },
              proposedValue: { routine_type: goal.type, scheme },
              criterion: 'CAMBIO_OBJETIVO',
              supportingData: { goalId: goal.id, requiresTrainerReview: true },
            },
            ...version.days.flatMap((day) =>
              day.exercises.map((exercise) => ({
                type: 'ESQUEMA' as const,
                routineExerciseId: exercise.id,
                previousValue: {
                  sets: exercise.sets.map((set) => ({
                    min_repetitions: set.minRepetitions,
                    max_repetitions: set.maxRepetitions,
                    rest_seconds: set.restSeconds,
                    warmup: set.warmup,
                  })),
                },
                proposedValue: {
                  requires_type_change: true,
                  min_repetitions: scheme.minRepetitions,
                  max_repetitions: scheme.maxRepetitions,
                  rest_seconds: scheme.restSeconds,
                  min_working_sets: scheme.minSets,
                  max_working_sets: scheme.maxSets,
                },
                criterion: 'CAMBIO_OBJETIVO',
                supportingData: { goalId: goal.id, requiresTypeChange: true },
              })),
            ),
          ],
        },
      },
    });
    for (const recipientUserId of [
      studentId,
      ...(assignment ? [assignment.trainerId] : []),
    ])
      await tx.notice.create({
        data: {
          recipientUserId,
          type: 'PROPUESTA_PENDIENTE',
          referenceType: 'ADAPTATION_PROPOSAL',
          referenceId: proposal.id,
          text: 'El objetivo cambió. Revisar el tipo de rutina y los esquemas propuestos.',
          createdAt: goal.startsOn,
        },
      });
  }
}
