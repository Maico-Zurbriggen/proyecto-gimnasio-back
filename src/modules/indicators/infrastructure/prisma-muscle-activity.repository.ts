import { Prisma, type PrismaClient } from '@prisma/client';
import type { MuscleActivityRepository } from '../application/muscle-activity.use-case';
import {
  GRUPOS_MUSCULARES,
  type ExerciseActivity,
  type MuscleAggregate,
} from '../domain/muscle-activity';

export class PrismaMuscleActivityRepository implements MuscleActivityRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async aggregate(input: Parameters<MuscleActivityRepository['aggregate']>[0]) {
    const { actor, studentId, from, to, now } = input;
    return this.prisma.$transaction(async (tx) => {
      const student = await tx.studentProfile.findFirst({
        where: { userId: studentId, user: { gymId: actor.gymId } },
        select: { user: { select: { gym: { select: { timezone: true } } } } },
      });
      if (!student) return null;
      const authorized = async () => {
        if (actor.id === studentId && actor.roles.includes('ALUMNO'))
          return true;
        if (!actor.roles.includes('ENTRENADOR')) return false;
        return (
          (await tx.trainerStudentAssignment.count({
            where: {
              trainerId: actor.id,
              studentId,
              trainer: { user: { gymId: actor.gymId } },
              startsAt: { lte: now },
              OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            },
          })) > 0
        );
      };
      if (!(await authorized())) return null;
      const timezone = student.user.gym.timezone;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const part = (type: string) => parts.find((p) => p.type === type)!.value;
      const today = `${part('year')}-${part('month')}-${part('day')}`;
      if (from > to || to > today)
        throw new RangeError(
          'El período no puede estar invertido ni terminar en el futuro del gimnasio',
        );
      const rows = await tx.$queryRaw<
        Array<{
          sessionCount: number;
          aggregates: MuscleAggregate[];
          exercises: ExerciseActivity[];
        }>
      >(Prisma.sql`
        WITH eligible AS MATERIALIZED (
          SELECT id FROM app.training_sessions
          WHERE student_id = ${studentId}::uuid AND NOT simulated
            AND state IN ('COMPLETADA', 'BLOQUEADA')
            AND occurred_on BETWEEN ${from}::date AND ${to}::date
        ), work AS MATERIALIZED (
          SELECT r.session_id, r.performed_exercise_id AS exercise_id
          FROM app.session_set_records r JOIN eligible s ON s.id = r.session_id
          WHERE r.completed AND NOT r.warmup AND r.omission_reason IS NULL
          UNION ALL
          SELECT r.session_id, r.performed_exercise_id
          FROM app.session_additional_set_records r JOIN eligible s ON s.id = r.session_id
          WHERE r.completed AND NOT r.warmup AND r.omission_reason IS NULL
        ), classification AS (
          SELECT exercise_id,
            jsonb_agg(jsonb_build_object('group', muscle_code, 'participation', participation)) AS muscles,
            bool_and(muscle_code IN (${Prisma.join([...GRUPOS_MUSCULARES])}))
              AND count(*) FILTER (WHERE participation = 'PRIMARIA') = 1 AS valid
          FROM app.exercise_muscles
          WHERE exercise_id IN (SELECT exercise_id FROM work)
          GROUP BY exercise_id
        ), muscles AS (
          SELECT m.muscle_code AS "group",
            count(*) FILTER (WHERE m.participation = 'PRIMARIA')::int AS "primarySets",
            count(*) FILTER (WHERE m.participation = 'SECUNDARIA')::int AS "secondarySets",
            count(DISTINCT w.session_id)::int AS sessions
          FROM work w JOIN classification c ON c.exercise_id = w.exercise_id AND c.valid
          JOIN app.exercise_muscles m ON m.exercise_id = w.exercise_id
          GROUP BY m.muscle_code
        ), exercises AS (
          SELECT w.exercise_id AS "exerciseId", count(*)::int AS "completedWorkSets",
            count(DISTINCT w.session_id)::int AS sessions,
            coalesce(c.muscles, '[]'::jsonb) AS muscles
          FROM work w LEFT JOIN classification c ON c.exercise_id = w.exercise_id
          GROUP BY w.exercise_id, c.muscles
        )
        SELECT (SELECT count(*)::int FROM eligible) AS "sessionCount",
          coalesce((SELECT jsonb_agg(m) FROM muscles m), '[]'::jsonb) AS aggregates,
          coalesce((SELECT jsonb_agg(e ORDER BY e."exerciseId") FROM exercises e), '[]'::jsonb) AS exercises
      `);
      if (!(await authorized())) return null;
      return { timezone, ...rows[0]! };
    });
  }
}
