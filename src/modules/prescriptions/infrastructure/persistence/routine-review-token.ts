import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaGenerationContextRepository } from '../../../routine-generations/infrastructure/persistence/prisma-generation-context.repository';
import { canonicalHash } from '../../../routine-generations/domain/services/generation-snapshot';

export async function routineReviewToken(
  database: PrismaClient | Prisma.TransactionClient,
  studentId: string,
  versionId: string,
  exerciseIds: string[],
): Promise<string> {
  const context = await new PrismaGenerationContextRepository(
    database,
  ).getStudentContext(studentId, new Date());
  const exercises = await database.exercise.findMany({
    where: { id: { in: [...new Set(exerciseIds)] } },
    select: {
      id: true,
      revision: true,
      state: true,
      availability: {
        where: {
          gymId: context?.gymId ?? '00000000-0000-0000-0000-000000000000',
        },
        select: { enabled: true, revision: true },
      },
    },
    orderBy: { id: 'asc' },
  });
  return canonicalHash({
    versionId,
    profileHash: context?.minimizedContext.profile_hash,
    exercises,
  });
}
