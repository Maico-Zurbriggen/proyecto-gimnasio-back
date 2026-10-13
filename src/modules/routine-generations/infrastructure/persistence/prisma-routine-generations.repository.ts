import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CreateRoutineGenerationRequest,
  ProposedRoutine,
  RoutineGenerationOwner,
  RoutineGenerationSnapshot,
  RoutineGenerationsRepository,
} from '../../application/ports/routine-generations.repository';
import {
  RoutineGenerationIdempotencyConflictError,
  RoutineGenerationOwnershipConflictError,
} from '../../domain/errors/routine-generation-errors';

export class PrismaRoutineGenerationsRepository implements RoutineGenerationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findProposedRoutineId(studentId: string): Promise<string | null> {
    const routine = await this.prisma.routine.findFirst({
      where: { studentId, state: 'PROPUESTA' },
      select: { id: true },
    });
    return routine?.id ?? null;
  }

  async findProposedRoutine(
    studentId: string,
  ): Promise<ProposedRoutine | null> {
    const routine = await this.prisma.routine.findFirst({
      where: { studentId, state: 'PROPUESTA' },
      select: {
        id: true,
        routineType: true,
        targetWeeklyFrequency: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            days: {
              orderBy: { position: 'asc' },
              select: {
                name: true,
                dominantPattern: true,
                exercises: {
                  orderBy: { position: 'asc' },
                  select: {
                    exerciseId: true,
                    note: true,
                    sets: {
                      orderBy: { position: 'asc' },
                      select: {
                        minRepetitions: true,
                        maxRepetitions: true,
                        suggestedLoad: true,
                        restSeconds: true,
                        warmup: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const version = routine?.versions[0];
    if (!routine || !version) return null;
    return {
      id: routine.id,
      structure: {
        routineType: routine.routineType,
        targetWeeklyFrequency: routine.targetWeeklyFrequency,
        days: version.days.map((day) => ({
          name: day.name,
          dominantPattern: day.dominantPattern,
          exercises: day.exercises.map((exercise) => ({
            exerciseId: exercise.exerciseId,
            note: exercise.note,
            sets: exercise.sets.map((set) => ({
              minRepetitions: set.minRepetitions,
              maxRepetitions: set.maxRepetitions,
              suggestedLoad:
                set.suggestedLoad === null ? null : Number(set.suggestedLoad),
              restSeconds: set.restSeconds,
              warmup: set.warmup,
            })),
          })),
        })),
      },
    };
  }

  async createOrGetRequest(input: CreateRoutineGenerationRequest) {
    const context = input.minimizedContext;
    const minimizedContext = {
      schema_version: '2.0',
      captured_at: context.captured_at ?? null,
      profile_hash: context.profile_hash ?? null,
      experience_level: context.nivelExperiencia,
      available_days_per_week: context.diasSemanalesDisponibles,
      active_goals: [...context.objetivosActivos].sort(),
      conditions: context.physical_conditions ?? [],
      profile: context.profile ?? null,
      available_equipment: context.available_equipment ?? ['PESO_CORPORAL'],
      fitness_clearance: context.fitness_clearance ?? 'AUSENTE',
      inventory_revision: context.inventory_revision ?? 0,
      history: context.history ?? null,
    } satisfies Prisma.InputJsonObject;
    const preferences = {
      schema_version: '2.0',
      ...(input.preferences.generation_task
        ? {
            generation_task: JSON.parse(
              JSON.stringify(input.preferences.generation_task),
            ) as Prisma.InputJsonObject,
          }
        : {}),
      ...(input.preferences.routine_renewal ? { routine_renewal: true } : {}),
      ...(input.preferences.routine_renewal_full_catalog
        ? { routine_renewal_full_catalog: true }
        : {}),
      ...(input.preferences.gym_generation_settings
        ? {
            gym_generation_settings: {
              revision: input.preferences.gym_generation_settings.revision,
              settings: input.preferences.gym_generation_settings.settings
                ? { ...input.preferences.gym_generation_settings.settings }
                : null,
            },
          }
        : {}),
      ...(input.preferences.routine_renewal_structure
        ? {
            routine_renewal_structure: {
              routine_type:
                input.preferences.routine_renewal_structure.routine_type,
              target_weekly_frequency:
                input.preferences.routine_renewal_structure
                  .target_weekly_frequency,
              days: input.preferences.routine_renewal_structure.days.map(
                (day) => ({
                  name: day.name,
                  dominant_pattern: day.dominant_pattern,
                  exercises: day.exercises.map((exercise) => ({
                    catalog_index: exercise.catalog_index,
                    exercise_name: exercise.exercise_name,
                    note: exercise.note,
                    sets: exercise.sets.map((set) => ({
                      min_repetitions: set.min_repetitions,
                      max_repetitions: set.max_repetitions,
                      suggested_load: set.suggested_load,
                      rest_seconds: set.rest_seconds,
                      warmup: set.warmup,
                    })),
                  })),
                }),
              ),
            },
          }
        : {}),
      ...(input.preferences.local_test_regeneration
        ? { local_test_regeneration: input.preferences.local_test_regeneration }
        : {}),
      ...(input.preferences.routine_change_replacement
        ? {
            routine_change_replacement: {
              replaces_proposed_routine_id:
                input.preferences.routine_change_replacement
                  .replaces_proposed_routine_id,
            },
          }
        : {}),
      free_text: input.preferences.free_text,
      parameters: input.preferences.parameters
        ? { ...input.preferences.parameters }
        : null,
      allowed_catalog: input.preferences.allowed_catalog.map((exercise) => ({
        ...exercise,
      })),
    } satisfies Prisma.InputJsonObject;
    // The replacement target is captured by the server, not part of caller input.
    const contextHash = hashInput(
      { ...minimizedContext, captured_at: null },
      {
        ...preferences,
        ...(input.preferences.routine_change_replacement
          ? { routine_change_replacement: true }
          : {}),
        ...(input.preferences.local_test_regeneration
          ? { local_test_regeneration: true }
          : {}),
      },
    );

    try {
      const created = await this.prisma.aiGenerationRequest.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          ...(input.ownership
            ? { ownership: { create: input.ownership } }
            : {}),
          minimizedContext,
          preferences,
          contextHash,
          retentionUntil: input.retentionUntil,
        },
        select: { id: true, state: true },
      });
      return {
        requestId: created.id,
        status: created.state,
        alreadyExisted: false,
      };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }

      const existing = await this.prisma.aiGenerationRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, state: true, contextHash: true },
      });
      if (!existing) throw error;
      if (existing.contextHash !== contextHash) {
        throw new RoutineGenerationIdempotencyConflictError();
      }

      return {
        requestId: existing.id,
        status: existing.state,
        alreadyExisted: true,
      };
    }
  }

  async registerOwnership(owner: RoutineGenerationOwner): Promise<void> {
    const stored = await this.prisma.routineGenerationOwnership.upsert({
      where: { requestId: owner.requestId },
      create: owner,
      update: {},
    });
    if (
      stored.studentId !== owner.studentId ||
      stored.requestedByUserId !== owner.requestedByUserId
    ) {
      throw new RoutineGenerationOwnershipConflictError();
    }
  }

  async findById(
    owner: RoutineGenerationOwner,
  ): Promise<RoutineGenerationSnapshot | null> {
    const record = await this.prisma.aiGenerationRequest.findUnique({
      where: { id: owner.requestId },
      include: {
        ownership: true,
        attempts: {
          orderBy: { attemptNumber: 'desc' },
          take: 1,
          include: {
            result: {
              include: {
                validations: { orderBy: { validatedAt: 'desc' }, take: 1 },
                routine: { select: { id: true } },
              },
            },
          },
        },
      },
    });

    if (
      !record ||
      record.ownership?.studentId !== owner.studentId ||
      record.ownership.requestedByUserId !== owner.requestedByUserId
    ) {
      return null;
    }

    const latestAttempt = record.attempts[0];
    const result = latestAttempt?.result;
    const latestValidation = result?.validations[0];
    const violations =
      latestValidation && !latestValidation.valid
        ? this.asViolations(latestValidation.violations)
        : null;
    const output = result?.structuredOutput;
    const unable =
      output &&
      typeof output === 'object' &&
      !Array.isArray(output) &&
      output.schema_version === '2.0' &&
      output.outcome === 'UNABLE';

    return {
      requestId: record.id,
      status: violations || unable ? 'NO_DISPONIBLE' : record.state,
      estructuraCandidata: result?.structuredOutput ?? null,
      violaciones: violations,
      error:
        record.state === 'NO_DISPONIBLE'
          ? (latestAttempt?.errorCode ?? 'unknown_error')
          : violations
            ? 'invalid_generated_routine'
            : unable
              ? 'generation_unable'
              : null,
      ...(unable
        ? { reason: typeof output.reason === 'string' ? output.reason : null }
        : {}),
      routineId: result?.routine?.id ?? null,
    };
  }

  private asViolations(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : ['La validación almacenada no tiene el formato esperado.'];
  }
}

function hashInput(
  context: Prisma.InputJsonObject,
  preferences: Prisma.InputJsonObject,
): string {
  const canonical = JSON.stringify(sortJson({ context, preferences }));
  return createHash('sha256').update(canonical).digest('hex');
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== 'object' || value === null) return value;

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}
