import type {
  CompatibilityState,
  MovementPattern,
  Prisma,
  PrismaClient,
} from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  CurrentVersionSnapshot,
  PersistResolutionCommand,
  PersistResolutionResult,
  ProposalRecord,
  ProposalsRepository,
} from '../../application/ports/proposals.repository';

const proposalInclude = {
  student: {
    include: {
      user: { select: { displayName: true } },
      bodyMeasurements: { select: { measuredOn: true } },
      adaptationProposals: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
      },
    },
  },
  diagnostic: {
    include: {
      routineVersion: {
        include: {
          routine: {
            include: {
              reviews: {
                where: { result: { in: ['APROBADA', 'APROBADA_CON_CAMBIOS'] } },
                orderBy: { reviewedAt: 'desc' },
                take: 1,
              },
              versions: { where: { current: true }, take: 1 },
            },
          },
        },
      },
    },
  },
  adjustments: {
    include: {
      routineExercise: { include: { exercise: { select: { name: true } } } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.AdaptationProposalInclude;

type ProposalRow = Prisma.AdaptationProposalGetPayload<{
  include: typeof proposalInclude;
}>;

function toRecord(row: ProposalRow): ProposalRecord {
  const routine = row.diagnostic.routineVersion.routine;
  const currentVersion = routine.versions[0];

  return {
    id: row.id,
    state: row.state,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    resolutionReason: row.resolutionReason,
    student: { id: row.studentId, displayName: row.student.user.displayName },
    diagnostic: {
      periodStart: row.diagnostic.periodStart,
      periodEnd: row.diagnostic.periodEnd,
      globalSituation: row.diagnostic.globalSituation,
      adherence:
        row.diagnostic.adherence === null
          ? null
          : Number(row.diagnostic.adherence),
    },
    routine: {
      id: routine.id,
      routineType: routine.routineType,
      cycleStart:
        routine.reviews[0]?.reviewedAt ??
        currentVersion?.createdAt ??
        routine.requestedAt,
      currentVersionNumber: currentVersion?.versionNumber ?? null,
    },
    adjustments: row.adjustments.map((adjustment) => ({
      id: adjustment.id,
      type: adjustment.type,
      routineExerciseId: adjustment.routineExerciseId,
      exerciseName: adjustment.routineExercise?.exercise.name ?? null,
      criterion: adjustment.criterion,
      previousValue: adjustment.previousValue,
      proposedValue: adjustment.proposedValue,
      supportingData: adjustment.supportingData,
      state: adjustment.state,
    })),
    measurementDates: row.student.bodyMeasurements.map(
      (measurement) => measurement.measuredOn,
    ),
    previousProposalDates: row.student.adaptationProposals
      .map((proposal) => proposal.createdAt)
      .filter((createdAt) => createdAt.getTime() < row.createdAt.getTime()),
  };
}

export class PrismaProposalsRepository implements ProposalsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(proposalId: string): Promise<ProposalRecord | null> {
    if (!isUuid(proposalId)) {
      return null;
    }

    const row = await this.prisma.adaptationProposal.findUnique({
      where: { id: proposalId },
      include: proposalInclude,
    });
    return row ? toRecord(row) : null;
  }

  async findPendingForTrainer(trainerId: string): Promise<ProposalRecord[]> {
    if (!isUuid(trainerId)) {
      return [];
    }

    const rows = await this.prisma.adaptationProposal.findMany({
      where: {
        state: 'PENDIENTE',
        student: { trainerAssignments: { some: { trainerId, endsAt: null } } },
      },
      include: proposalInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRecord);
  }

  async findCurrentVersion(
    routineId: string,
  ): Promise<CurrentVersionSnapshot | null> {
    const version = await this.prisma.routineVersion.findFirst({
      where: { routineId, current: true },
      include: {
        days: {
          orderBy: { position: 'asc' },
          include: {
            exercises: {
              orderBy: { position: 'asc' },
              include: { sets: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });
    if (!version) {
      return null;
    }

    return {
      routineId,
      days: version.days.map((day) => ({
        position: day.position,
        name: day.name,
        dominantPattern: day.dominantPattern,
        exercises: day.exercises.map((exercise) => ({
          sourceId: exercise.id,
          exerciseId: exercise.exerciseId,
          position: exercise.position,
          note: exercise.note,
          compatibilityState: exercise.compatibilityState,
          compatibilityReason: exercise.compatibilityReason,
          sets: exercise.sets.map((set) => ({
            position: set.position,
            minRepetitions: set.minRepetitions,
            maxRepetitions: set.maxRepetitions,
            suggestedLoad: Number(set.suggestedLoad),
            restSeconds: set.restSeconds,
            warmup: set.warmup,
          })),
        })),
      })),
    };
  }

  async persistResolution(
    command: PersistResolutionCommand,
  ): Promise<PersistResolutionResult> {
    const { plan } = command;

    return this.prisma.$transaction(
      async (tx) => {
        // Bloquea la fila: una segunda resolución concurrente espera y encuentra el estado final.
        const locked = await tx.$queryRaw<Array<{ state: string }>>`
          SELECT state::text AS state
          FROM app.adaptation_proposals
          WHERE id = ${command.proposalId}::uuid
          FOR UPDATE`;
        if (locked[0]?.state !== 'PENDIENTE') {
          return { resolved: false, resultingVersionNumber: null };
        }

        let resultingVersionId: string | null = null;
        let resultingVersionNumber: number | null = null;

        if (plan.reviewResult && command.routineId && command.newVersionDays) {
          const last = await tx.routineVersion.aggregate({
            where: { routineId: command.routineId },
            _max: { versionNumber: true },
          });
          resultingVersionNumber = (last._max.versionNumber ?? 0) + 1;

          // La versión anterior se conserva íntegra; sólo deja de ser la actual.
          await tx.routineVersion.updateMany({
            where: { routineId: command.routineId, current: true },
            data: { current: false },
          });

          const version = await tx.routineVersion.create({
            data: {
              routineId: command.routineId,
              versionNumber: resultingVersionNumber,
              current: true,
              createdByUserId: command.trainerId,
              adaptationProposalId: command.proposalId,
              createdAt: command.resolvedAt,
            },
          });
          resultingVersionId = version.id;

          for (const day of command.newVersionDays) {
            const createdDay = await tx.routineDay.create({
              data: {
                routineVersionId: version.id,
                position: day.position,
                name: day.name,
                dominantPattern: day.dominantPattern as MovementPattern,
              },
            });
            for (const exercise of day.exercises) {
              await tx.routineExercise.create({
                data: {
                  routineDayId: createdDay.id,
                  exerciseId: exercise.exerciseId,
                  position: exercise.position,
                  note: exercise.note,
                  compatibilityState:
                    exercise.compatibilityState as CompatibilityState,
                  compatibilityReason: exercise.compatibilityReason,
                  sets: { create: exercise.sets },
                },
              });
            }
          }

          // La resolución es la revisión (RN-35a) y reinicia el ciclo de renovación.
          await tx.routineReview.create({
            data: {
              routineId: command.routineId,
              reviewedVersionId: version.id,
              reviewerTrainerId: command.trainerId,
              result: plan.reviewResult,
              observation:
                plan.reason ?? 'Resolución de propuesta de adaptación.',
              reviewedAt: command.resolvedAt,
            },
          });
        }

        if (plan.acceptedIds.length > 0) {
          await tx.proposedAdjustment.updateMany({
            where: { id: { in: plan.acceptedIds } },
            data: { state: 'ACEPTADO' },
          });
        }
        if (plan.rejectedIds.length > 0) {
          await tx.proposedAdjustment.updateMany({
            where: { id: { in: plan.rejectedIds } },
            data: { state: 'RECHAZADO' },
          });
        }

        await tx.adaptationProposal.update({
          where: { id: command.proposalId },
          data: {
            state: plan.state,
            resolvedByTrainerId: command.trainerId,
            resultingVersionId,
            resolutionReason: plan.reason,
            resolvedAt: command.resolvedAt,
          },
        });

        // RN-108: la resolución de propuestas queda auditada.
        await tx.auditLog.create({
          data: {
            actorUserId: command.trainerId,
            operation: 'RESOLUCION_PROPUESTA',
            entityType: 'ADAPTATION_PROPOSAL',
            entityId: command.proposalId,
            previousValue: { state: 'PENDIENTE' },
            newValue: {
              state: plan.state,
              ajustesAceptados: plan.acceptedIds,
              ajustesRechazados: plan.rejectedIds,
              versionResultante: resultingVersionNumber,
              motivo: plan.reason,
            },
          },
        });

        if (resultingVersionNumber !== null && command.routineId) {
          await tx.notice.create({
            data: {
              recipientUserId: command.studentId,
              type: 'RUTINA_AJUSTADA',
              referenceType: 'ROUTINE',
              referenceId: command.routineId,
              text: `Tu entrenador ajustó tu rutina (versión ${resultingVersionNumber}).`,
              createdAt: command.resolvedAt,
            },
          });
        }

        return { resolved: true, resultingVersionNumber };
      },
      { timeout: 20_000 },
    );
  }
}
