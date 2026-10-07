import {
  Prisma,
  type PrismaClient,
  type AiGenerationRequest,
  type AiGenerationResult,
} from '@prisma/client';
import { validateGenerationV2 } from '../../../../integrations/ai/routine-generation-v2';
import {
  lockCatalogExercises,
  lockGymCatalog,
} from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import type { RoutineGenerationOwner } from '../../application/ports/routine-generations.repository';
import {
  GeneratedRoutineInvalidError,
  GenerationContextChangedError,
  GenerationUnableError,
  ProposedRoutineAlreadyExistsError,
  RoutineGenerationNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import { PrismaGenerationContextRepository } from './prisma-generation-context.repository';

const snapshotSchema = (value: Prisma.JsonValue) => {
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
            movementPattern: item.movement_pattern,
            revision: item.revision,
            availabilityRevision: item.availability_revision,
          },
        ]
      : [],
  );
};

export async function finalizeGenerationV2(
  prisma: PrismaClient,
  request: AiGenerationRequest,
  result: AiGenerationResult,
  owner: RoutineGenerationOwner,
  replacementId: string | null,
) {
  const snapshot = snapshotSchema(request.preferences);
  const validation = validateGenerationV2(result.structuredOutput, snapshot);
  if (validation.unableReason)
    throw new GenerationUnableError(validation.unableReason);
  if (!result.structurallyValid || !validation.routine) {
    const violations = validation.violations.length
      ? validation.violations
      : ['Invalid AI result'];
    await prisma.aiResultValidation.create({
      data: {
        resultId: result.id,
        validatorVersion: 'routine-generation-backend@2.0',
        valid: false,
        violations,
      },
    });
    throw new GeneratedRoutineInvalidError(violations);
  }
  const routine = validation.routine;
  const ids = [
    ...new Set(
      routine.days.flatMap((day) =>
        day.exercises.map((exercise) => exercise.exerciseId),
      ),
    ),
  ];
  const profile = request.minimizedContext;
  const profileHash =
    profile && typeof profile === 'object' && !Array.isArray(profile)
      ? profile.profile_hash
      : null;
  const student = await prisma.user.findUnique({
    where: { id: owner.studentId },
    select: { gymId: true },
  });
  if (!student) throw new RoutineGenerationNotFoundError();

  const persist = () =>
    prisma.$transaction(
      async (tx) => {
        await lockGymCatalog(tx, student.gymId);
        await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${owner.studentId}::uuid FOR UPDATE`;
        const existing = await tx.routine.findUnique({
          where: { sourceGenerationResultId: result.id },
          select: { id: true },
        });
        if (existing) return existing;
        await lockCatalogExercises(tx, ids);
        const contextRepository = new PrismaGenerationContextRepository(tx);
        const currentContext = await contextRepository.getStudentContext(
          owner.studentId,
          new Date(),
        );
        if (
          !profileHash ||
          currentContext?.gymId !== student.gymId ||
          currentContext.minimizedContext.profile_hash !== profileHash
        )
          throw new GenerationContextChangedError();
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
        const pending = await tx.routine.findFirst({
          where: { studentId: owner.studentId, state: 'PROPUESTA' },
          select: { id: true },
        });
        if (pending) {
          if (pending.id !== replacementId)
            throw new ProposedRoutineAlreadyExistsError();
          await tx.routine.update({
            where: { id: pending.id },
            data: { state: 'DESCARTADA' },
          });
          await tx.auditLog.create({
            data: {
              actorUserId: owner.requestedByUserId,
              operation: 'LOCAL_ROUTINE_REGENERATION',
              entityType: 'ROUTINE',
              entityId: pending.id,
              previousValue: { state: 'PROPUESTA' },
              newValue: {
                state: 'DESCARTADA',
                generationRequestId: request.id,
              },
            },
          });
        }
        await tx.aiResultValidation.create({
          data: {
            resultId: result.id,
            validatorVersion: 'routine-generation-backend@2.0',
            valid: true,
            violations: [],
          },
        });
        return tx.routine.create({
          data: {
            studentId: owner.studentId,
            sourceGenerationResultId: result.id,
            routineType: routine.routineType,
            targetWeeklyFrequency: routine.targetWeeklyFrequency,
            state: 'PROPUESTA',
            origin: 'GENERADA',
            requestedByUserId: owner.requestedByUserId,
            versions: {
              create: {
                versionNumber: 1,
                current: false,
                createdByUserId: owner.requestedByUserId,
                days: {
                  create: routine.days.map((day) => ({
                    position: day.position,
                    name: day.name,
                    dominantPattern: day.dominantPattern,
                    exercises: {
                      create: day.exercises.map((exercise) => ({
                        exerciseId: exercise.exerciseId,
                        position: exercise.position,
                        note: exercise.note,
                        compatibilityState: 'ADVERTIDO',
                        compatibilityReason:
                          'Propuesta de IA pendiente de revisión profesional.',
                        sets: {
                          create: exercise.sets.map((set) => ({
                            ...set,
                            suggestedLoad:
                              set.suggestedLoad === null
                                ? null
                                : new Prisma.Decimal(set.suggestedLoad),
                          })),
                        },
                      })),
                    },
                  })),
                },
              },
            },
          },
          select: { id: true },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 15000,
      },
    );
  let created;
  for (let attempt = 0; ; attempt++) {
    try {
      created = await persist();
      break;
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2034' ||
        attempt >= 2
      )
        throw error;
    }
  }
  return { routineId: created.id, status: 'PROPUESTA' as const };
}
