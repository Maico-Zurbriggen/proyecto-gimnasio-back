import type { Prisma, AiGenerationRequest } from '@prisma/client';
import {
  lockCatalogExercises,
  lockGymCatalog,
} from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import {
  GenerationContextChangedError,
  RoutineGenerationNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import { canonicalHash } from '../../domain/services/generation-snapshot';
import { PrismaGenerationContextRepository } from './prisma-generation-context.repository';

export const generationCatalogSnapshot = (value: Prisma.JsonValue) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(value.allowed_catalog)
  )
    return [];
  return value.allowed_catalog.flatMap((item) =>
    item &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    typeof item.id === 'string' &&
    typeof item.movement_pattern === 'string' &&
    typeof item.revision === 'number'
      ? [
          {
            id: item.id,
            name: typeof item.name === 'string' ? item.name : item.id,
            movementPattern: item.movement_pattern,
            revision: item.revision,
            availabilityRevision: item.availability_revision,
          },
        ]
      : [],
  );
};

/** Shared technical validation for initial generation and renewal, including approval. */
export async function assertGenerationContextCurrent(
  tx: Prisma.TransactionClient,
  request: AiGenerationRequest,
  studentId: string,
  exerciseIds: string[],
  asOf: Date,
  preserveEvolutionEvidence = false,
): Promise<void> {
  const student = await tx.user.findUnique({
    where: { id: studentId },
    select: { gymId: true },
  });
  if (!student) throw new RoutineGenerationNotFoundError();
  await lockGymCatalog(tx, student.gymId);
  await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${studentId}::uuid FOR UPDATE`;
  const ids = [...new Set(exerciseIds)];
  await lockCatalogExercises(tx, ids);
  const context = await new PrismaGenerationContextRepository(
    tx,
  ).getStudentContext(studentId, asOf);
  const preferences = request.preferences;
  if (
    preferences &&
    typeof preferences === 'object' &&
    !Array.isArray(preferences)
  ) {
    const policy = preferences.gym_generation_settings;
    if (
      policy &&
      typeof policy === 'object' &&
      !Array.isArray(policy) &&
      policy.revision !== context?.generationSettings?.revision
    )
      throw new GenerationContextChangedError();
  }
  const profile = request.minimizedContext;
  const profileHash =
    profile && typeof profile === 'object' && !Array.isArray(profile)
      ? profile.profile_hash
      : null;
  if (
    !profileHash ||
    !context ||
    context.gymId !== student.gymId ||
    !profile ||
    typeof profile !== 'object' ||
    Array.isArray(profile)
  )
    throw new GenerationContextChangedError();
  if (preserveEvolutionEvidence) {
    // Renewal evidence is historical. Still compare the material profile at approval,
    // so a new goal/condition cannot pass merely because it began after capture.
    const current = context.minimizedContext;
    const material = {
      experience_level: current.nivelExperiencia,
      available_days_per_week: current.diasSemanalesDisponibles,
      active_goals: [...current.objetivosActivos].sort(),
      conditions: current.physical_conditions ?? [],
      profile: current.profile ?? null,
      available_equipment: current.available_equipment ?? ['PESO_CORPORAL'],
      fitness_clearance: current.fitness_clearance ?? 'AUSENTE',
      inventory_revision: current.inventory_revision ?? 0,
    };
    const captured = Object.fromEntries(
      Object.keys(material).map((key) => [key, profile[key]]),
    );
    if (canonicalHash(material) !== canonicalHash(captured))
      throw new GenerationContextChangedError();
  } else if (context.minimizedContext.profile_hash !== profileHash)
    throw new GenerationContextChangedError();
  const snapshot = generationCatalogSnapshot(request.preferences);
  const selected = await tx.exercise.findMany({
    where: {
      id: { in: ids },
      state: 'APROBADO',
      availability: { some: { gymId: student.gymId, enabled: true } },
      OR: [
        { gymId: null, origin: 'CATALOGO_BASE' },
        { gymId: student.gymId, origin: 'GIMNASIO' },
      ],
    },
    select: {
      id: true,
      revision: true,
      availability: {
        where: { gymId: student.gymId },
        select: { revision: true },
      },
    },
  });
  if (
    selected.length !== ids.length ||
    selected.some((item) => {
      const ref = snapshot.find((ref) => ref.id === item.id);
      return (
        item.revision !== ref?.revision ||
        item.availability[0]?.revision !== ref?.availabilityRevision
      );
    })
  )
    throw new GenerationContextChangedError();
}
