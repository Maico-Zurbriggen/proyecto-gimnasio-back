import type { PrismaClient } from '@prisma/client';

import type { AuthUser } from '../../../shared/types/auth';
import type {
  StudentContextRecord,
  StudentContextRepository,
} from '../application/student-context.use-cases';
import type { Sexo, StudentContextInput } from '../domain/student-context';

const contextSelect = {
  experienceLevel: true,
  availableDaysPerWeek: true,
  birthDate: true,
  sex: true,
  heightCm: true,
} as const;

function toRecord(row: {
  experienceLevel: StudentContextRecord['experienceLevel'];
  availableDaysPerWeek: number | null;
  birthDate: Date | null;
  sex: string | null;
  heightCm: { toNumber(): number } | null;
}): StudentContextRecord {
  return {
    experienceLevel: row.experienceLevel,
    availableDaysPerWeek: row.availableDaysPerWeek,
    birthDate: row.birthDate?.toISOString().slice(0, 10) ?? null,
    sex: (row.sex as Sexo | null) ?? null,
    heightCm: row.heightCm === null ? null : row.heightCm.toNumber(),
  };
}

export class PrismaStudentContextRepository implements StudentContextRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async find(actor: AuthUser): Promise<StudentContextRecord | null> {
    const row = await this.prisma.studentProfile.findFirst({
      where: { userId: actor.id, user: { gymId: actor.gymId } },
      select: contextSelect,
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
      const row = await tx.studentProfile.update({
        where: { userId: actor.id },
        data: {
          experienceLevel: input.experienceLevel,
          availableDaysPerWeek: input.availableDaysPerWeek,
          birthDate: new Date(`${input.birthDate}T00:00:00Z`),
          sex: input.sex,
          heightCm: input.heightCm,
          ...(alturaCambia ? { heightUpdatedAt: now } : {}),
        },
        select: contextSelect,
      });
      return toRecord(row);
    });
  }
}
