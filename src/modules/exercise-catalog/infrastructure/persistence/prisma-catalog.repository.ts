import { Prisma, type PrismaClient } from '@prisma/client';
import type { ExerciseCatalogRepository } from '../../application/catalog.repository';
import type {
  AvailabilityChange,
  CatalogActor,
  CatalogExercise,
  CatalogQuery,
  ExerciseInput,
  ExerciseState,
} from '../../domain/catalog';
import { CatalogError } from '../../domain/catalog';

const include = {
  equipment: true,
  muscles: true,
  joints: true,
  media: { orderBy: { position: 'asc' as const } },
  availability: true,
} satisfies Prisma.ExerciseInclude;
type Row = Prisma.ExerciseGetPayload<{ include: typeof include }>;

function toDto(row: Row, gymId: string): CatalogExercise {
  const availability = row.availability.find((item) => item.gymId === gymId);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    instructions: row.instructions,
    tips: row.tips,
    movementPattern: row.movementPattern,
    difficultyLevel: row.difficultyLevel,
    unilateral: row.unilateral,
    origin: row.origin,
    state: row.state,
    revision: row.revision,
    authorUserId: row.authorUserId,
    source: row.source,
    reviewObservation: row.reviewObservation,
    updatedAt: row.updatedAt.toISOString(),
    equipment: row.equipment.map((item) => item.equipmentCode),
    primaryMuscles: row.muscles
      .filter((item) => item.participation === 'PRIMARIA')
      .map((item) => item.muscleCode),
    secondaryMuscles: row.muscles
      .filter((item) => item.participation === 'SECUNDARIA')
      .map((item) => item.muscleCode),
    joints: row.joints.map((item) => item.jointCode),
    media: row.media.length
      ? row.media.map((item) => ({ pose: item.pose, url: item.url }))
      : [{ pose: 'PRINCIPAL', url: row.visualResourceUrl }],
    enabled: row.state === 'APROBADO' && (availability?.enabled ?? false),
    availabilityUpdatedAt: availability?.updatedAt.toISOString() ?? null,
    availabilityRevision: availability?.revision ?? null,
  };
}

function visible(
  actor: CatalogActor,
  search: boolean,
): Prisma.ExerciseWhereInput {
  const canReview = actor.roles.includes('ADMINISTRADOR');
  const canAuthor = actor.roles.includes('ENTRENADOR');
  return {
    OR: [
      {
        gymId: null,
        origin: 'CATALOGO_BASE',
        ...(search ? { state: 'APROBADO' } : {}),
      },
      {
        gymId: actor.gymId,
        origin: 'GIMNASIO',
        ...(!canReview
          ? {
              OR: [
                {
                  state: {
                    in: search ? ['APROBADO'] : ['APROBADO', 'DESACTIVADO'],
                  },
                },
                ...(canAuthor ? [{ authorUserId: actor.id }] : []),
              ],
            }
          : {}),
      },
    ],
  };
}

export async function lockGymCatalog(
  tx: Prisma.TransactionClient,
  gymId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM app.gyms WHERE id = ${gymId}::uuid FOR UPDATE`;
}

export async function lockCatalogExercises(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<void> {
  if (ids.length)
    await tx.$queryRaw`SELECT id FROM app.exercises WHERE id IN (${Prisma.join([...new Set(ids)].sort().map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR SHARE`;
}

export async function assertGymExercisesAvailable(
  tx: Prisma.TransactionClient,
  gymId: string,
  exerciseIds: string[],
): Promise<void> {
  const ids = [...new Set(exerciseIds)];
  await lockCatalogExercises(tx, ids);
  const available = await tx.exercise.count({
    where: {
      id: { in: ids },
      state: 'APROBADO',
      availability: { some: { gymId, enabled: true } },
      OR: [
        { gymId: null, origin: 'CATALOGO_BASE' },
        { gymId, origin: 'GIMNASIO' },
      ],
    },
  });
  if (available !== ids.length)
    throw new CatalogError('routine_exercise_unavailable', 409);
}

async function validateReferences(
  tx: Prisma.TransactionClient,
  input: ExerciseInput,
): Promise<void> {
  const [equipment, muscles, joints] = await Promise.all([
    tx.equipment.count({ where: { code: { in: input.equipment } } }),
    tx.muscleGroup.count({
      where: {
        code: { in: [...input.primaryMuscles, ...input.secondaryMuscles] },
      },
    }),
    tx.joint.count({ where: { code: { in: input.joints } } }),
  ]);
  if (
    equipment !== input.equipment.length ||
    muscles !== input.primaryMuscles.length + input.secondaryMuscles.length ||
    joints !== input.joints.length
  )
    throw new CatalogError('invalid_catalog_taxonomy', 422);
}

function exerciseData(input: ExerciseInput) {
  return {
    name: input.name,
    description: input.description,
    instructions: input.instructions,
    tips: input.tips,
    movementPattern: input.movementPattern,
    difficultyLevel: input.difficultyLevel,
    unilateral: input.unilateral,
    visualResourceUrl: input.media[0]!.url,
  };
}
function relations(input: ExerciseInput) {
  return {
    equipment: {
      create: input.equipment.map((equipmentCode) => ({ equipmentCode })),
    },
    muscles: {
      create: [
        ...input.primaryMuscles.map((muscleCode) => ({
          muscleCode,
          participation: 'PRIMARIA' as const,
        })),
        ...input.secondaryMuscles.map((muscleCode) => ({
          muscleCode,
          participation: 'SECUNDARIA' as const,
        })),
      ],
    },
    joints: { create: input.joints.map((jointCode) => ({ jointCode })) },
    media: {
      create: input.media.map((item, i) => ({ ...item, position: i + 1 })),
    },
  };
}

export class PrismaExerciseCatalogRepository implements ExerciseCatalogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async taxonomies() {
    const [equipment, muscles, joints] = await Promise.all([
      this.prisma.equipment.findMany({
        orderBy: { displayOrder: 'asc' },
        select: { code: true, name: true },
      }),
      this.prisma.muscleGroup.findMany({
        orderBy: { displayOrder: 'asc' },
        select: { code: true, name: true },
      }),
      this.prisma.joint.findMany({
        orderBy: { displayOrder: 'asc' },
        select: { code: true, name: true },
      }),
    ]);
    return { equipment, muscles, joints };
  }

  async list(actor: CatalogActor, query: CatalogQuery) {
    const enabled: Prisma.ExerciseWhereInput = {
      state: 'APROBADO',
      availability: { some: { gymId: actor.gymId, enabled: true } },
    };
    const where: Prisma.ExerciseWhereInput = {
      AND: [
        visible(actor, true),
        ...(query.enabled === undefined
          ? []
          : [query.enabled ? enabled : { NOT: enabled }]),
      ],
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.muscle
        ? { muscles: { some: { muscleCode: query.muscle } } }
        : {}),
      ...(query.equipment
        ? { equipment: { some: { equipmentCode: query.equipment } } }
        : {}),
      ...(query.pattern ? { movementPattern: query.pattern } : {}),
      ...(query.difficulty ? { difficultyLevel: query.difficulty } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.origin ? { origin: query.origin } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.exercise.findMany({
        where,
        include: {
          ...include,
          availability: { where: { gymId: actor.gymId } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.exercise.count({ where }),
    ]);
    return {
      items: items.map((row) => toDto(row, actor.gymId)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async find(actor: CatalogActor, id: string) {
    const item = await this.prisma.exercise.findFirst({
      where: { id, AND: [visible(actor, false)] },
      include: { ...include, availability: { where: { gymId: actor.gymId } } },
    });
    return item ? toDto(item, actor.gymId) : null;
  }

  async create(actor: CatalogActor, input: ExerciseInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockGymCatalog(tx, actor.gymId);
        await validateReferences(tx, input);
        const item = await tx.exercise.create({
          data: {
            ...exerciseData(input),
            ...relations(input),
            gymId: actor.gymId,
            authorUserId: actor.id,
            origin: 'GIMNASIO',
            state: 'PROPUESTO',
          },
          include,
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            operation: 'EXERCISE_CREATED',
            entityType: 'EXERCISE',
            entityId: item.id,
            newValue: { revision: item.revision, state: item.state },
          },
        });
        return toDto(item, actor.gymId);
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async update(
    actor: CatalogActor,
    id: string,
    revision: number,
    input: ExerciseInput,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockGymCatalog(tx, actor.gymId);
        const current = await tx.exercise.findFirst({
          where: {
            id,
            gymId: actor.gymId,
            origin: 'GIMNASIO',
            authorUserId: actor.id,
          },
        });
        if (!current) throw new CatalogError('exercise_not_found', 404);
        if (current.revision !== revision)
          throw new CatalogError('catalog_revision_conflict', 409);
        if (current.state === 'APROBADO')
          throw new CatalogError('approved_exercise_requires_retirement', 409);
        await validateReferences(tx, input);
        const item = await tx.exercise.update({
          where: { id },
          data: {
            ...exerciseData(input),
            state: 'PROPUESTO',
            revision: { increment: 1 },
            reviewedAt: null,
            reviewedByUserId: null,
            reviewObservation: null,
            equipment: { deleteMany: {}, ...relations(input).equipment },
            muscles: { deleteMany: {}, ...relations(input).muscles },
            joints: { deleteMany: {}, ...relations(input).joints },
            media: { deleteMany: {}, ...relations(input).media },
          },
          include,
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            operation: 'EXERCISE_UPDATED',
            entityType: 'EXERCISE',
            entityId: id,
            previousValue: { revision, state: current.state },
            newValue: { revision: item.revision, state: item.state },
          },
        });
        return toDto(item, actor.gymId);
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  async review(
    actor: CatalogActor,
    id: string,
    revision: number,
    state: ExerciseState,
    observation: string | null,
    enable = false,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockGymCatalog(tx, actor.gymId);
      const current = await tx.exercise.findFirst({
        where: { id, gymId: actor.gymId, origin: 'GIMNASIO' },
      });
      if (!current) throw new CatalogError('exercise_not_found', 404);
      if (current.revision !== revision)
        throw new CatalogError('catalog_revision_conflict', 409);
      if (
        current.state === state &&
        current.reviewObservation === observation &&
        !enable
      ) {
        return toDto(
          await tx.exercise.findUniqueOrThrow({ where: { id }, include }),
          actor.gymId,
        );
      }
      if (state === 'RECHAZADO' && current.state !== 'PROPUESTO')
        throw new CatalogError('invalid_exercise_transition', 409);
      if (
        state === 'APROBADO' &&
        !['PROPUESTO', 'DESACTIVADO'].includes(current.state)
      )
        throw new CatalogError('invalid_exercise_transition', 409);
      const item = await tx.exercise.update({
        where: { id },
        data: {
          state,
          revision: { increment: 1 },
          reviewedByUserId: actor.id,
          reviewedAt: new Date(),
          reviewObservation: observation,
        },
        include,
      });
      if (state !== 'APROBADO') {
        await tx.gymExercise.updateMany({
          where: { gymId: actor.gymId, exerciseId: id, enabled: true },
          data: {
            enabled: false,
            updatedByUserId: actor.id,
            revision: { increment: 1 },
          },
        });
        await this.markUnavailable(tx, actor.gymId, [id]);
      }
      if (enable) {
        await tx.gymExercise.upsert({
          where: { gymId_exerciseId: { gymId: actor.gymId, exerciseId: id } },
          create: {
            gymId: actor.gymId,
            exerciseId: id,
            enabled: true,
            updatedByUserId: actor.id,
          },
          update: {
            enabled: true,
            revision: { increment: 1 },
            updatedByUserId: actor.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            operation: 'EXERCISE_AVAILABILITY_CHANGED',
            entityType: 'EXERCISE',
            entityId: id,
            newValue: { gymId: actor.gymId, enabled: true },
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          operation: 'EXERCISE_REVIEWED',
          entityType: 'EXERCISE',
          entityId: id,
          previousValue: { state: current.state, revision },
          newValue: { state, revision: item.revision, observation },
        },
      });
      return toDto(
        enable
          ? await tx.exercise.findUniqueOrThrow({ where: { id }, include })
          : item,
        actor.gymId,
      );
    });
  }

  async setAvailability(actor: CatalogActor, changes: AvailabilityChange[]) {
    return this.prisma.$transaction(async (tx) => {
      await lockGymCatalog(tx, actor.gymId);
      const ids = changes.map((item) => item.exerciseId);
      await lockCatalogExercises(tx, ids);
      const items = await tx.exercise.findMany({
        where: {
          id: { in: ids },
          OR: [
            { origin: 'CATALOGO_BASE', gymId: null },
            { origin: 'GIMNASIO', gymId: actor.gymId },
          ],
        },
        include: { availability: { where: { gymId: actor.gymId } } },
      });
      if (items.length !== ids.length)
        throw new CatalogError('exercise_not_found', 404);
      let changed = 0;
      const disabled: string[] = [];
      for (const change of changes) {
        const item = items.find((item) => item.id === change.exerciseId)!;
        if (change.enabled && item.state !== 'APROBADO')
          throw new CatalogError('exercise_not_approved', 409);
        const current = item.availability[0];
        if ((current?.enabled ?? false) === change.enabled) continue;
        if ((current?.revision ?? null) !== change.expectedRevision)
          throw new CatalogError('availability_conflict', 409);
        await tx.gymExercise.upsert({
          where: {
            gymId_exerciseId: { gymId: actor.gymId, exerciseId: item.id },
          },
          create: {
            gymId: actor.gymId,
            exerciseId: item.id,
            enabled: change.enabled,
            updatedByUserId: actor.id,
          },
          update: {
            enabled: change.enabled,
            updatedByUserId: actor.id,
            revision: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.id,
            operation: 'EXERCISE_AVAILABILITY_CHANGED',
            entityType: 'EXERCISE',
            entityId: item.id,
            previousValue: {
              enabled: current?.enabled ?? false,
              gymId: actor.gymId,
            },
            newValue: { enabled: change.enabled, gymId: actor.gymId },
          },
        });
        changed++;
        if (!change.enabled) disabled.push(item.id);
      }
      await this.markUnavailable(tx, actor.gymId, disabled);
      return { changed };
    });
  }

  async inventory(actor: CatalogActor) {
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.gymEquipment.findMany({
          where: { gymId: actor.gymId },
          orderBy: { updatedAt: 'desc' },
        });
        const gym = await tx.gym.findUniqueOrThrow({
          where: { id: actor.gymId },
          select: { inventoryRevision: true },
        });
        return {
          equipment: [
            ...new Set([
              'PESO_CORPORAL',
              ...rows
                .filter((item) => item.present)
                .map((item) => item.equipmentCode),
            ]),
          ].sort(),
          updatedAt: rows[0]?.updatedAt.toISOString() ?? null,
          revision: gym.inventoryRevision,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async setInventory(
    actor: CatalogActor,
    equipment: string[],
    expectedRevision: number,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await lockGymCatalog(tx, actor.gymId);
      const desired = new Set(['PESO_CORPORAL', ...equipment]);
      if (
        (await tx.equipment.count({
          where: { code: { in: [...desired] } },
        })) !== desired.size
      )
        throw new CatalogError('invalid_catalog_taxonomy', 422);
      const current = await tx.gymEquipment.findMany({
        where: { gymId: actor.gymId },
        orderBy: { updatedAt: 'desc' },
      });
      const present = new Set([
        'PESO_CORPORAL',
        ...current
          .filter((item) => item.present)
          .map((item) => item.equipmentCode),
      ]);
      const changed = [...new Set([...present, ...desired])].filter(
        (code) => present.has(code) !== desired.has(code),
      );
      if (!changed.length)
        return { relatedExerciseIds: [], relatedExercises: [] };
      const gym = await tx.gym.findUniqueOrThrow({
        where: { id: actor.gymId },
        select: { inventoryRevision: true },
      });
      if (gym.inventoryRevision !== expectedRevision)
        throw new CatalogError('inventory_conflict', 409);
      for (const equipmentCode of changed)
        await tx.gymEquipment.upsert({
          where: { gymId_equipmentCode: { gymId: actor.gymId, equipmentCode } },
          create: {
            gymId: actor.gymId,
            equipmentCode,
            present: desired.has(equipmentCode),
            updatedByUserId: actor.id,
          },
          update: {
            present: desired.has(equipmentCode),
            updatedByUserId: actor.id,
          },
        });
      const related = await tx.gymExercise.findMany({
        where: {
          gymId: actor.gymId,
          enabled: true,
          exercise: { equipment: { some: { equipmentCode: { in: changed } } } },
        },
        select: {
          exerciseId: true,
          exercise: { select: { id: true, name: true } },
        },
        orderBy: { exercise: { name: 'asc' } },
      });
      await tx.gym.update({
        where: { id: actor.gymId },
        data: { inventoryRevision: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          operation: 'GYM_INVENTORY_CHANGED',
          entityType: 'GYM',
          entityId: actor.gymId,
          previousValue: { equipment: [...present].sort() },
          newValue: {
            equipment: [...desired].sort(),
            relatedExerciseIds: related.map((item) => item.exerciseId),
          },
        },
      });
      return {
        relatedExerciseIds: related.map((item) => item.exerciseId),
        relatedExercises: related.map((item) => item.exercise),
      };
    });
  }

  private async markUnavailable(
    tx: Prisma.TransactionClient,
    gymId: string,
    exerciseIds: string[],
  ) {
    if (!exerciseIds.length) return;
    await tx.routineExercise.updateMany({
      where: {
        exerciseId: { in: exerciseIds },
        routineDay: {
          routineVersion: {
            routine: {
              student: { user: { gymId } },
              state: { in: ['VIGENTE', 'PROPUESTA'] },
            },
          },
        },
      },
      data: {
        compatibilityState: 'EJERCICIO_DESACTIVADO',
        compatibilityReason:
          'Ejercicio no disponible en el gimnasio. Requiere revisión del entrenador.',
      },
    });
  }

  private rethrow(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new CatalogError('exercise_name_exists', 409);
    throw error;
  }
}
