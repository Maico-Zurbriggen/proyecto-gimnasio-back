import type { Prisma, PrismaClient } from '@prisma/client';

import type { AuthUser } from '../../../shared/types/auth';
import type {
  StudentContextRecord,
  StudentContextRepository,
} from '../application/student-context.use-cases';
import type { Sexo, StudentContextInput } from '../domain/student-context';

/** Perfil, último peso y asignación vigente, todo en una lectura. */
function contextSelect(now: Date) {
  return {
    experienceLevel: true,
    availableDaysPerWeek: true,
    birthDate: true,
    sex: true,
    heightCm: true,
    bodyMeasurements: {
      where: { type: 'PESO_CORPORAL' },
      orderBy: { measuredOn: 'desc' },
      take: 1,
      select: { value: true },
    },
    trainerAssignments: {
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      orderBy: { startsAt: 'desc' },
      take: 1,
      select: {
        trainer: {
          select: { user: { select: { id: true, displayName: true } } },
        },
      },
    },
  } satisfies Prisma.StudentProfileSelect;
}

type ContextRow = Prisma.StudentProfileGetPayload<{
  select: ReturnType<typeof contextSelect>;
}>;

function toRecord(row: ContextRow): StudentContextRecord {
  const weight = row.bodyMeasurements[0]?.value;
  const trainer = row.trainerAssignments[0]?.trainer.user;
  return {
    experienceLevel: row.experienceLevel,
    availableDaysPerWeek: row.availableDaysPerWeek,
    birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
    sex: (row.sex as Sexo | null) ?? null,
    heightCm: row.heightCm === null ? null : row.heightCm.toNumber(),
    weightKg: weight === undefined ? null : weight.toNumber(),
    trainer: trainer
      ? { id: trainer.id, displayName: trainer.displayName }
      : null,
  };
}

export class PrismaStudentContextRepository implements StudentContextRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(actor: AuthUser): Promise<StudentContextRecord | null> {
    const row = await this.prisma.studentProfile.findFirst({
      where: { userId: actor.id, user: { gymId: actor.gymId } },
      select: contextSelect(new Date()),
    });
    return row ? toRecord(row) : null;
  }

  async save(
    actor: AuthUser,
    input: StudentContextInput,
    now: Date,
  ): Promise<StudentContextRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.studentProfile.findFirst({
        where: {
          userId: actor.id,
          user: { gymId: actor.gymId, state: 'ACTIVO' },
        },
        select: { heightCm: true },
      });
      if (!current) return null;

      const alturaCambia =
        current.heightCm === null ||
        current.heightCm.toNumber() !== input.heightCm;
      await tx.studentProfile.update({
        where: { userId: actor.id },
        data: {
          experienceLevel: input.experienceLevel,
          availableDaysPerWeek: input.availableDaysPerWeek,
          birthDate: new Date(`${input.birthDate}T00:00:00Z`),
          sex: input.sex,
          heightCm: input.heightCm,
          ...(alturaCambia ? { heightUpdatedAt: now } : {}),
        },
      });

      // Misma convención que la carga de medidas (HU02): una por tipo y día.
      const measuredOn = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
      await tx.bodyMeasurement.upsert({
        where: {
          studentId_type_measuredOn: {
            studentId: actor.id,
            type: 'PESO_CORPORAL',
            measuredOn,
          },
        },
        create: {
          studentId: actor.id,
          type: 'PESO_CORPORAL',
          value: input.weightKg,
          measuredOn,
        },
        update: { value: input.weightKg },
      });

      const row = await tx.studentProfile.findUniqueOrThrow({
        where: { userId: actor.id },
        select: contextSelect(now),
      });
      return toRecord(row);
    });
  }
}
