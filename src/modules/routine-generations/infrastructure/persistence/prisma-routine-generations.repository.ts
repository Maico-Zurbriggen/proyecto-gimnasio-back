import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  CreateRoutineGenerationRequest,
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

  async createOrGetRequest(input: CreateRoutineGenerationRequest) {
    const minimizedContext = {
      experience_level: input.minimizedContext.nivelExperiencia,
      available_days_per_week: input.minimizedContext.diasSemanalesDisponibles,
      active_goals: [...input.minimizedContext.objetivosActivos].sort(),
      conditions: [...input.minimizedContext.condiciones].sort(),
    } satisfies Prisma.InputJsonObject;
    const preferences = {
      ...(input.preferences.muscle_counts_per_day
        ? {
            muscle_counts_per_day: input.preferences.muscle_counts_per_day.map(
              (requirement) => ({ ...requirement }),
            ),
          }
        : {}),
      ...(input.preferences.local_test_regeneration
        ? { local_test_regeneration: input.preferences.local_test_regeneration }
        : {}),
      ...(input.preferences.prescription_constraints
        ? {
            prescription_constraints:
              input.preferences.prescription_constraints,
          }
        : {}),
      free_text: input.preferences.free_text,
      parameters: input.preferences.parameters
        ? { ...input.preferences.parameters }
        : null,
      allowed_catalog: input.preferences.allowed_catalog.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        movement_pattern: exercise.movement_pattern,
        ...(exercise.primary_muscles
          ? { primary_muscles: exercise.primary_muscles }
          : {}),
      })),
    } satisfies Prisma.InputJsonObject;
    // The replacement target is captured by the server, not part of caller input.
    const contextHash = hashInput(minimizedContext, {
      ...preferences,
      ...(input.preferences.local_test_regeneration
        ? { local_test_regeneration: true }
        : {}),
    });

    try {
      const created = await this.prisma.aiGenerationRequest.create({
        data: {
          idempotencyKey: input.idempotencyKey,
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

    return {
      requestId: record.id,
      status: violations ? 'NO_DISPONIBLE' : record.state,
      estructuraCandidata: result?.structuredOutput ?? null,
      violaciones: violations,
      error:
        record.state === 'NO_DISPONIBLE'
          ? (latestAttempt?.errorCode ?? 'unknown_error')
          : violations
            ? 'invalid_generated_routine'
            : null,
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
