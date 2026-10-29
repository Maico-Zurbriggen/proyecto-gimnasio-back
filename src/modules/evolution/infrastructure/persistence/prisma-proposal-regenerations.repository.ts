import { Prisma, type PrismaClient } from '@prisma/client';
import { noticeEventKeys } from '../../../notifications/domain/notice-event';
import { CatalogError } from '../../../exercise-catalog/domain/catalog';
import { lockGymCatalog } from '../../../exercise-catalog/infrastructure/persistence/prisma-catalog.repository';
import { validateGenerationV2 } from '../../../../integrations/ai/routine-generation-v2';
import { canonicalHash } from '../../../routine-generations/domain/services/generation-snapshot';
import {
  assertGenerationContextCurrent,
  generationCatalogSnapshot,
} from '../../../routine-generations/infrastructure/persistence/generation-context-validity';
import {
  validateGymGenerationSettings,
  generationPolicySnapshot,
} from '../../../routine-generations/infrastructure/persistence/validate-gym-generation-settings';
import type { ProposalRegenerationsRepository } from '../../application/ports/proposal-regenerations.repository';
import type { RenewalEvaluation } from '../../application/ports/routine-renewals.repository';
import type { RoutineRenewalStructureInput } from '../../../routine-generations/application/dto/routine-generation-context.dto';

export class PrismaProposalRegenerationsRepository implements ProposalRegenerationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  latest(proposalId: string) {
    return this.prisma.routineProposalRegeneration.findFirst({
      where: { proposalId },
      orderBy: { sequence: 'desc' },
    });
  }

  private async lockProposal(tx: Prisma.TransactionClient, proposalId: string) {
    const ref = await tx.adaptationProposal.findUniqueOrThrow({
      where: { id: proposalId },
      select: {
        studentId: true,
        student: { select: { user: { select: { gymId: true } } } },
      },
    });
    await lockGymCatalog(tx, ref.student.user.gymId);
    await tx.$queryRaw`SELECT user_id FROM app.student_profiles WHERE user_id = ${ref.studentId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM app.adaptation_proposals WHERE id = ${proposalId}::uuid FOR UPDATE`;
    return tx.adaptationProposal.findUniqueOrThrow({
      where: { id: proposalId },
      include: {
        renewalCycle: {
          include: {
            routineVersion: { include: { routine: true } },
            request: { select: { preferences: true } },
          },
        },
        adjustments: true,
      },
    });
  }

  async reserve(input: {
    proposalId: string;
    trainerId: string;
    idempotencyKey: string;
    candidateRequestId: string;
    feedback: string;
    now: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const proposal = await this.lockProposal(tx, input.proposalId);
      const blocked = await tx.studentMeasurementBlock.findFirst({
        where: { studentId: proposal.studentId, state: { not: 'RESUELTO' } },
      });
      const student = await tx.user.findUniqueOrThrow({
        where: { id: proposal.studentId },
        select: { state: true },
      });
      if (blocked || student.state !== 'ACTIVO')
        throw new CatalogError('student_generation_blocked', 409);
      const cycle = proposal.renewalCycle;
      const assignment = await tx.trainerStudentAssignment.findFirst({
        where: {
          studentId: proposal.studentId,
          trainerId: input.trainerId,
          endsAt: null,
          startsAt: { lte: input.now },
        },
      });
      if (!assignment) throw new CatalogError('forbidden_not_assigned', 403);
      if (!cycle?.requestId)
        throw new CatalogError('proposal_regeneration_not_supported', 409);
      const adjustment = proposal.adjustments.find(
        (item) => item.type === 'ESTRUCTURA',
      );
      if (!adjustment)
        throw new CatalogError('proposal_regeneration_not_supported', 409);
      const existing = await tx.routineProposalRegeneration.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (
        existing &&
        (existing.proposalId !== input.proposalId ||
          existing.trainerId !== input.trainerId ||
          existing.feedback !== input.feedback ||
          existing.candidateRequestId !== input.candidateRequestId)
      )
        throw new CatalogError('regeneration_idempotency_conflict', 409);
      if (
        proposal.state !== 'PENDIENTE' ||
        !cycle.routineVersion.current ||
        cycle.routineVersion.routine.state !== 'VIGENTE'
      )
        throw new CatalogError('proposal_not_pending', 409);
      const active = await tx.routineProposalRegeneration.findFirst({
        where: { proposalId: input.proposalId, state: 'PENDIENTE' },
      });
      if (!existing && cycle.requestId !== input.candidateRequestId)
        throw new CatalogError('proposal_candidate_changed', 409);
      if (
        active &&
        (active.trainerId !== input.trainerId ||
          active.feedback !== input.feedback)
      )
        throw new CatalogError('proposal_regeneration_pending', 409);
      const last = await tx.routineProposalRegeneration.aggregate({
        where: { proposalId: input.proposalId },
        _max: { sequence: true },
      });
      const regeneration =
        existing ??
        active ??
        (await tx.routineProposalRegeneration.create({
          data: {
            proposalId: input.proposalId,
            sequence: (last._max.sequence ?? 0) + 1,
            trainerId: input.trainerId,
            idempotencyKey: input.idempotencyKey,
            feedback: input.feedback,
            candidateRequestId: cycle.requestId,
            createdAt: input.now,
          },
        }));
      return {
        regeneration,
        source: {
          studentId: proposal.studentId,
          evaluation: cycle.evaluation as unknown as RenewalEvaluation,
          previousCandidate: (() => {
            const candidate =
              adjustment.proposedValue as unknown as RoutineRenewalStructureInput;
            // Only the plan is context. Its old policy and presentation metadata are not instructions.
            return {
              routineType: candidate.routineType,
              targetWeeklyFrequency: candidate.days.length,
              days: candidate.days.map((day) => ({
                name: day.name,
                dominantPattern: day.dominantPattern,
                exercises: day.exercises.map((exercise) => ({
                  exerciseId: exercise.exerciseId,
                  note: exercise.note,
                  sets: exercise.sets.map((set) => ({
                    minRepetitions: set.minRepetitions,
                    maxRepetitions: set.maxRepetitions,
                    suggestedLoad: set.suggestedLoad,
                    restSeconds: set.restSeconds,
                    warmup: set.warmup,
                  })),
                })),
              })),
            };
          })(),
          cycleStartsOn: cycle.cycleStartsOn,
          dueOn: cycle.dueOn,
        },
      };
    });
  }

  async attach(id: string, requestId: string) {
    await this.prisma.routineProposalRegeneration.updateMany({
      where: { id, state: 'PENDIENTE', requestId: null },
      data: { requestId },
    });
  }

  async finish(id: string, now: Date) {
    return this.prisma.$transaction(
      async (tx) => {
        const regeneration =
          await tx.routineProposalRegeneration.findUniqueOrThrow({
            where: { id },
          });
        const proposal = await this.lockProposal(tx, regeneration.proposalId);
        const currentRegeneration =
          await tx.routineProposalRegeneration.findUniqueOrThrow({
            where: { id },
            include: {
              request: {
                include: {
                  attempts: {
                    orderBy: { attemptNumber: 'desc' },
                    take: 1,
                    include: { result: true },
                  },
                },
              },
            },
          });
        if (currentRegeneration.state !== 'PENDIENTE')
          return currentRegeneration;
        const request = currentRegeneration.request;
        if (
          !request ||
          request.state === 'PENDIENTE' ||
          request.state === 'PROCESANDO'
        )
          return currentRegeneration;
        if (request.state !== 'COMPLETADA')
          throw new Error(
            request.attempts[0]?.errorCode ===
              'routine_regeneration_candidate_unchanged'
              ? 'La IA no logró producir una planilla diferente en los intentos disponibles. Podés volver a intentar.'
              : 'La IA no pudo regenerar la propuesta.',
          );
        const cycle = proposal.renewalCycle;
        if (
          proposal.state !== 'PENDIENTE' ||
          !cycle ||
          cycle.requestId !== regeneration.candidateRequestId ||
          !cycle.routineVersion.current ||
          cycle.routineVersion.routine.state !== 'VIGENTE'
        )
          throw new Error(
            'La propuesta o la rutina vigente cambió durante la regeneración.',
          );
        const assignment = await tx.trainerStudentAssignment.findFirst({
          where: {
            studentId: proposal.studentId,
            trainerId: regeneration.trainerId,
            endsAt: null,
            startsAt: { lte: now },
          },
        });
        if (!assignment)
          throw new Error('El entrenador ya no tiene asignado al alumno.');
        const result = request.attempts[0]?.result;
        if (!result?.structurallyValid)
          throw new Error('La IA no entregó una propuesta válida.');
        const validation = validateGenerationV2(
          result.structuredOutput,
          generationCatalogSnapshot(request.preferences),
        );
        if (!validation.routine)
          throw new Error(
            validation.unableReason ?? validation.violations.join('; '),
          );
        const candidate = validation.routine;
        const blocked = await tx.studentMeasurementBlock.findFirst({
          where: { studentId: proposal.studentId, state: { not: 'RESUELTO' } },
        });
        const student = await tx.user.findUniqueOrThrow({
          where: { id: proposal.studentId },
          select: { state: true },
        });
        if (blocked || student.state !== 'ACTIVO')
          throw new Error(
            'El alumno está bloqueado; la propuesta anterior se conserva.',
          );
        validateGymGenerationSettings(candidate, request.preferences);
        await assertGenerationContextCurrent(
          tx,
          request,
          proposal.studentId,
          candidate.days.flatMap((d) => d.exercises.map((e) => e.exerciseId)),
          now,
          true,
        );
        const adjustment = proposal.adjustments.find(
          (a) => a.type === 'ESTRUCTURA',
        )!;
        const previous =
          adjustment.proposedValue as unknown as typeof candidate;
        const fingerprint = (value: typeof candidate) =>
          canonicalHash({
            type: value.routineType,
            frequency: value.targetWeeklyFrequency,
            days: value.days.map((day) =>
              day.exercises.map((e) => ({ id: e.exerciseId, sets: e.sets })),
            ),
          });
        if (fingerprint(candidate) === fingerprint(previous))
          throw new Error(
            'La IA repitió la propuesta anterior. Podés volver a intentar.',
          );
        const evaluation = cycle.evaluation as unknown as RenewalEvaluation;
        if (evaluation.estructuraVigente) {
          const shape = (
            days:
              | typeof candidate.days
              | NonNullable<RenewalEvaluation['estructuraVigente']>['days'],
          ) =>
            JSON.stringify(
              days.map((d) => d.exercises.map((e) => e.exerciseId)),
            );
          if (
            candidate.routineType ===
              evaluation.estructuraVigente.routineType &&
            candidate.targetWeeklyFrequency ===
              evaluation.estructuraVigente.targetWeeklyFrequency &&
            shape(candidate.days) === shape(evaluation.estructuraVigente.days)
          )
            throw new Error('La IA no propuso un cambio de estructura.');
        }
        const names = new Map(
          generationCatalogSnapshot(request.preferences).map((e) => [
            e.id,
            e.name,
          ]),
        );
        const sourceNames = new Map(
          generationCatalogSnapshot(cycle.request?.preferences ?? null).map(
            (entry) => [entry.id, entry.name],
          ),
        );
        const preservedNames = (
          adjustment.proposedValue as {
            sourceExerciseNames?: Record<string, string>;
          }
        ).sourceExerciseNames;
        const enriched = {
          ...candidate,
          generationSettings: generationPolicySnapshot(request.preferences),
          sourceExerciseNames: Object.fromEntries(
            evaluation.estructuraVigente?.days.flatMap((day) =>
              day.exercises.map((exercise) => [
                exercise.exerciseId,
                exercise.exerciseName ??
                  preservedNames?.[exercise.exerciseId] ??
                  sourceNames.get(exercise.exerciseId) ??
                  names.get(exercise.exerciseId) ??
                  exercise.exerciseId,
              ]),
            ) ?? [],
          ),
          days: candidate.days.map((d) => ({
            ...d,
            exercises: d.exercises.map((e) => ({
              ...e,
              exerciseName: names.get(e.exerciseId),
            })),
          })),
        };
        const json = JSON.parse(
          JSON.stringify(enriched),
        ) as Prisma.InputJsonValue;
        await tx.proposedAdjustment.update({
          where: { id: adjustment.id },
          data: { proposedValue: json },
        });
        await tx.routineRenewalCycle.update({
          where: { id: cycle.id },
          data: { requestId: request.id },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: regeneration.trainerId,
            operation: 'REGENERATE_ADAPTATION_PROPOSAL',
            entityType: 'ADAPTATION_PROPOSAL',
            entityId: proposal.id,
            previousValue: {
              requestId: regeneration.candidateRequestId,
              candidate: adjustment.proposedValue,
            },
            newValue: {
              requestId: request.id,
              candidate: json,
              feedback: regeneration.feedback,
            },
            createdAt: now,
          },
        });
        return tx.routineProposalRegeneration.update({
          where: { id },
          data: { state: 'COMPLETADA', finishedAt: now },
        });
      },
      { timeout: 20000 },
    );
  }

  async fail(id: string, message: string, now: Date) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.routineProposalRegeneration.findUniqueOrThrow({
        where: { id },
      });
      const changed = await tx.routineProposalRegeneration.updateMany({
        where: { id, state: 'PENDIENTE' },
        data: {
          state: 'NO_DISPONIBLE',
          error: message.slice(0, 1000),
          finishedAt: now,
        },
      });
      if (changed.count)
        await tx.notice.upsert({
          where: {
            recipientUserId_eventKey: {
              recipientUserId: row.trainerId,
              eventKey: noticeEventKeys.proposalRegenerationFailed(row.id),
            },
          },
          update: {},
          create: {
            recipientUserId: row.trainerId,
            eventKey: noticeEventKeys.proposalRegenerationFailed(row.id),
            audienceRole: 'ENTRENADOR',
            type: 'SENAL_DETECTADA',
            referenceType: 'ADAPTATION_PROPOSAL',
            referenceId: row.proposalId,
            text: 'No se pudo regenerar la propuesta con IA. La planilla anterior sigue disponible para revisión.',
            createdAt: now,
          },
        });
    });
  }
}
