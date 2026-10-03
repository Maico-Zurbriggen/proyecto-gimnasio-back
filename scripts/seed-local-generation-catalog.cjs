require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { catalog, normalizeName } = require('./local-exercise-catalog.cjs');

const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) ||
  !databaseUrl.port ||
  databaseUrl.port !== (process.env.LOCAL_DATABASE_PORT ?? '55432') ||
  databaseUrl.pathname !== '/gym_local'
) {
  throw new Error('This fixture only supports the local gym_local database');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const student = await prisma.studentProfile.findUniqueOrThrow({
      where: { userId: '21000000-0000-4000-8000-000000000004' },
      select: { user: { select: { gymId: true } } },
    });
    const gymId = student.user.gymId;
    const trainer = await prisma.user.findFirstOrThrow({
      where: { gymId, roles: { some: { role: 'ENTRENADOR' } } },
      select: { id: true },
    });
    const scope = { OR: [{ gymId }, { origin: 'CATALOGO_BASE' }] };
    const muscleGroups = await prisma.muscleGroup.findMany({
      select: { code: true },
    });
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.exercise.findMany({
          where: scope,
          select: { id: true, name: true },
        });
        const names = new Set(
          existing.map((exercise) => normalizeName(exercise.name)),
        );
        let created = 0;
        for (const entry of catalog) {
          const normalized = normalizeName(entry.name);
          if (names.has(normalized)) continue;
          const {
            primaryMuscle,
            secondaryMuscles,
            equipment,
            joints,
            ...fields
          } = entry;
          await tx.exercise.create({
            data: {
              ...fields,
              gymId,
              authorUserId: trainer.id,
              origin: 'GIMNASIO',
              equipment: {
                create: equipment.map((equipmentCode) => ({ equipmentCode })),
              },
              muscles: {
                create: [
                  { muscleCode: primaryMuscle, participation: 'PRIMARIA' },
                  ...secondaryMuscles.map((muscleCode) => ({
                    muscleCode,
                    participation: 'SECUNDARIA',
                  })),
                ],
              },
              joints: { create: joints.map((jointCode) => ({ jointCode })) },
            },
          });
          names.add(normalized);
          created += 1;
        }
        const counts = await tx.exerciseMuscle.groupBy({
          by: ['muscleCode'],
          where: { participation: 'PRIMARIA', exercise: scope },
          _count: { _all: true },
        });
        const byMuscle = Object.fromEntries(
          counts.map((row) => [row.muscleCode, row._count._all]),
        );
        const missing = muscleGroups.filter(
          (group) => (byMuscle[group.code] ?? 0) < 5,
        );
        if (missing.length)
          throw new Error(
            `Insufficient primary exercise coverage: ${missing.map((group) => group.code).join(', ')}`,
          );
        const total = await tx.exercise.count({ where: scope });
        return {
          created,
          skipped: catalog.length - created,
          total,
          muscles: muscleGroups.length,
          minimumPerMuscle: Math.min(
            ...muscleGroups.map((group) => byMuscle[group.code]),
          ),
          byMuscle,
        };
      },
      { timeout: 30000 },
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
