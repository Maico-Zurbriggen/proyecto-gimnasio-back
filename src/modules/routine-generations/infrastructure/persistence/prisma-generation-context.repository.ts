import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  CatalogExerciseRef,
  MinimizedContext,
} from '../../application/dto/routine-generation-context.dto';
import type {
  GenerationContextRepository,
  StudentGenerationContext,
} from '../../application/ports/generation-context.repository';
import { canonicalHash } from '../../domain/services/generation-snapshot';

type Database = PrismaClient | Prisma.TransactionClient;

export class PrismaGenerationContextRepository implements GenerationContextRepository {
  constructor(private readonly prisma: Database) {}

  async getStudentContext(
    studentId: string,
    asOf: Date,
  ): Promise<StudentGenerationContext | null> {
    const student = await this.prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: {
        user: {
          select: {
            gymId: true,
            gym: { select: { inventoryRevision: true, timezone: true } },
          },
        },
        goals: true,
        physicalConditions: true,
        routines: {
          where: { state: 'VIGENTE' },
          take: 1,
          include: {
            versions: {
              where: { current: true },
              take: 1,
              include: {
                days: {
                  include: { exercises: { select: { exerciseId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!student) return null;
    const localDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: student.user.gym.timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(asOf);
    const day = new Date(`${localDate}T00:00:00Z`);
    const active = (start: Date, end: Date | null) =>
      start <= day && (end === null || end >= day);
    const since = new Date(day.getTime() - 27 * 86400000);
    const [equipment, sessions, records, clearance, weight] = await Promise.all(
      [
        this.prisma.gymEquipment.findMany({
          where: { gymId: student.user.gymId, present: true },
          select: { equipmentCode: true },
        }),
        this.prisma.trainingSession.findMany({
          where: {
            studentId,
            state: 'COMPLETADA',
            completedAt: { lte: asOf },
            occurredOn: { gte: since, lte: day },
          },
          select: { id: true, occurredOn: true },
          orderBy: { occurredOn: 'desc' },
        }),
        this.prisma.sessionSetRecord.findMany({
          where: {
            session: {
              studentId,
              state: 'COMPLETADA',
              completedAt: { lte: asOf },
              occurredOn: { gte: since, lte: day },
            },
            completed: true,
            warmup: false,
          },
          select: {
            perceivedEffort: true,
            performedExerciseId: true,
            prescribedExerciseId: true,
            performedLoad: true,
            performedRepetitions: true,
            performedExercise: { select: { name: true } },
            prescribedExercise: { select: { name: true } },
          },
        }),
        this.prisma.fitnessClearance.findFirst({
          where: { studentId, issuedOn: { lte: day } },
          orderBy: { expiresOn: 'desc' },
        }),
        this.prisma.bodyMeasurement.findFirst({
          where: { studentId, type: 'PESO_CORPORAL', measuredOn: { lte: day } },
          orderBy: { measuredOn: 'desc' },
        }),
      ],
    );
    const effort = records.flatMap((record) =>
      record.perceivedEffort === null ? [] : [Number(record.perceivedEffort)],
    );
    const routine = student.routines[0];
    const birthday = student.birthDate;
    const age =
      day.getUTCFullYear() -
      birthday.getUTCFullYear() -
      (day.getUTCMonth() < birthday.getUTCMonth() ||
      (day.getUTCMonth() === birthday.getUTCMonth() &&
        day.getUTCDate() < birthday.getUTCDate())
        ? 1
        : 0);
    const context: MinimizedContext = {
      schema_version: '2.0',
      nivelExperiencia: student.experienceLevel,
      diasSemanalesDisponibles: student.availableDaysPerWeek,
      objetivosActivos: student.goals
        .filter((goal) => active(goal.startsOn, goal.endsOn))
        .map((goal) => goal.type)
        .sort(),
      condiciones: [],
      inventory_revision: student.user.gym.inventoryRevision,
      physical_conditions: student.physicalConditions
        .filter((condition) => active(condition.startsOn, condition.endsOn))
        .map((condition) => ({
          body_zone: condition.bodyZoneCode,
          severity: condition.severity,
          starts_on: condition.startsOn.toISOString().slice(0, 10),
          ends_on: condition.endsOn?.toISOString().slice(0, 10) ?? null,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      profile: {
        age_years: age,
        sex: student.sex,
        height_cm: Number(student.heightCm),
        weight_kg: weight ? Number(weight.value) : null,
      },
      available_equipment: [
        ...new Set([
          'PESO_CORPORAL',
          ...equipment.map((item) => item.equipmentCode),
        ]),
      ].sort(),
      fitness_clearance: !clearance
        ? 'AUSENTE'
        : clearance.expiresOn >= day && clearance.issuedOn <= day
          ? 'VIGENTE'
          : 'VENCIDA',
      history: {
        period_start: since.toISOString().slice(0, 10),
        period_end: day.toISOString().slice(0, 10),
        completed_sessions: sessions.length,
        work_sets: records.length,
        effort_mean: effort.length
          ? effort.reduce((a, b) => a + b, 0) / effort.length
          : null,
        latest_session:
          sessions[0]?.occurredOn.toISOString().slice(0, 10) ?? null,
        current_routine: routine
          ? {
              routine_type: routine.routineType,
              weekly_frequency: routine.targetWeeklyFrequency,
              exercise_ids: [
                ...new Set(
                  routine.versions[0]?.days.flatMap((item) =>
                    item.exercises.map((exercise) => exercise.exerciseId),
                  ) ?? [],
                ),
              ].sort(),
            }
          : null,
      },
    };
    const byExercise = new Map<string, typeof records>();
    for (const record of records) {
      const id = record.performedExerciseId ?? record.prescribedExerciseId;
      const group = byExercise.get(id) ?? [];
      group.push(record);
      byExercise.set(id, group);
    }
    const mean = (values: (number | null)[]) => {
      const available = values.filter(
        (value): value is number => value !== null,
      );
      return available.length
        ? available.reduce((a, b) => a + b, 0) / available.length
        : null;
    };
    context.history!.exercise_performance = [...byExercise.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, rows]) => ({
        exercise_id: id,
        exercise_name:
          rows[0]?.performedExercise?.name ??
          rows[0]?.prescribedExercise.name ??
          null,
        work_sets: rows.length,
        average_load: mean(
          rows.map((row) =>
            row.performedLoad === null ? null : Number(row.performedLoad),
          ),
        ),
        average_repetitions: mean(rows.map((row) => row.performedRepetitions)),
        average_effort: mean(rows.map((row) => row.perceivedEffort)),
      }));
    context.profile_hash = canonicalHash({
      gymId: student.user.gymId,
      context,
    });
    context.captured_at = asOf.toISOString();
    return { gymId: student.user.gymId, minimizedContext: context };
  }

  async getEnabledCatalog(gymId: string): Promise<CatalogExerciseRef[]> {
    const exercises = await this.prisma.exercise.findMany({
      where: {
        state: 'APROBADO',
        availability: { some: { gymId, enabled: true } },
        OR: [
          { gymId: null, origin: 'CATALOGO_BASE' },
          { gymId, origin: 'GIMNASIO' },
        ],
      },
      include: {
        equipment: true,
        muscles: true,
        joints: true,
        availability: { where: { gymId } },
      },
      orderBy: { id: 'asc' },
    });
    return exercises.map((exercise) => ({
      id: exercise.id,
      nombre: exercise.name,
      patronMovimiento: exercise.movementPattern,
      instrucciones: exercise.instructions,
      dificultad: exercise.difficultyLevel,
      unilateral: exercise.unilateral,
      revision: exercise.revision,
      descripcion: exercise.description,
      consejos: exercise.tips,
      availabilityUpdatedAt: exercise.availability[0]!.updatedAt.toISOString(),
      availabilityRevision: exercise.availability[0]!.revision,
      musculosPrimarios: exercise.muscles
        .filter((item) => item.participation === 'PRIMARIA')
        .map((item) => item.muscleCode)
        .sort(),
      musculosSecundarios: exercise.muscles
        .filter((item) => item.participation === 'SECUNDARIA')
        .map((item) => item.muscleCode)
        .sort(),
      equipamiento: exercise.equipment.map((item) => item.equipmentCode).sort(),
      articulaciones: exercise.joints.map((item) => item.jointCode).sort(),
    }));
  }
}
