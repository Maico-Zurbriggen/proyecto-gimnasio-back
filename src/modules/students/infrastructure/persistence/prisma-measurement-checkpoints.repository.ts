import type { PrismaClient } from '@prisma/client';

import type {
  MeasurementCheckpointEvaluationResult,
  MeasurementCheckpointsRepository,
} from '../../application/ports/measurement-checkpoints.repository';
import {
  dueMeasurementCycles,
  initialMeasurementBaseline,
  localDateAt,
  updateConsecutiveMisses,
} from '../../domain/services/measurement-cycle';

const FAVORABLE_REVIEWS = ['APROBADA', 'APROBADA_CON_CAMBIOS'] as const;
const ACTIVE_BLOCK_STATES = [
  'PENDIENTE_MEDICION',
  'PENDIENTE_APROBACION',
] as const;
const JOB_LOCK_ID = 2_609_281_900;

export class PrismaMeasurementCheckpointsRepository implements MeasurementCheckpointsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async evaluateDueCycles(
    evaluatedAt: Date,
  ): Promise<MeasurementCheckpointEvaluationResult> {
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
          SELECT pg_try_advisory_xact_lock(${JOB_LOCK_ID}) AS acquired
        `;
        if (!lock?.acquired) {
          return {
            checkpointsCreated: 0,
            blocksCreated: 0,
            skippedConcurrentRun: true,
          };
        }

        let checkpointsCreated = 0;
        let blocksCreated = 0;

        const profiles = await tx.studentProfile.findMany({
          where: {
            routines: {
              some: {
                state: 'VIGENTE',
                reviews: { some: { result: { in: [...FAVORABLE_REVIEWS] } } },
              },
            },
            measurementBlocks: {
              none: { state: { in: [...ACTIVE_BLOCK_STATES] } },
            },
          },
          include: {
            user: { include: { gym: { select: { timezone: true } } } },
            bodyMeasurements: {
              where: { type: 'PESO_CORPORAL' },
              select: { id: true, measuredOn: true },
              orderBy: { measuredOn: 'asc' },
            },
            measurementCheckpoints: { orderBy: { dueOn: 'asc' } },
            measurementBlocks: {
              where: { state: 'RESUELTO' },
              orderBy: { approvedAt: 'desc' },
            },
            routines: {
              include: {
                reviews: {
                  where: { result: { in: [...FAVORABLE_REVIEWS] } },
                  orderBy: { reviewedAt: 'asc' },
                  select: {
                    reviewedAt: true,
                    reviewedVersionId: true,
                  },
                },
              },
            },
          },
        });

        for (const profile of profiles) {
          const timeZone = profile.user.gym.timezone;
          const reviews = profile.routines
            .flatMap((routine) =>
              routine.reviews.map((review) => ({
                routineId: routine.id,
                ...review,
              })),
            )
            .sort(
              (left, right) =>
                left.reviewedAt.getTime() - right.reviewedAt.getTime(),
            );
          const firstReview = reviews[0];
          if (!firstReview) {
            continue;
          }

          const latestResolution = profile.measurementBlocks[0]?.approvedAt;
          const relevantCheckpoints = profile.measurementCheckpoints.filter(
            ({ evaluatedAt: checkpointEvaluatedAt }) =>
              !latestResolution || checkpointEvaluatedAt > latestResolution,
          );
          const baselineInstant = latestResolution ?? firstReview.reviewedAt;
          const baseline = latestResolution
            ? localDateAt(baselineInstant, timeZone)
            : initialMeasurementBaseline(
                localDateAt(baselineInstant, timeZone),
              );
          const lastDueOn = relevantCheckpoints.at(-1)?.dueOn ?? null;
          const today = localDateAt(evaluatedAt, timeZone);
          const dueCycles = dueMeasurementCycles(baseline, lastDueOn, today);

          let consecutiveMisses = relevantCheckpoints.reduce(
            (streak, checkpoint) =>
              updateConsecutiveMisses(streak, checkpoint.result),
            0,
          );

          for (const cycle of dueCycles) {
            const context = reviews.findLast(
              (review) =>
                localDateAt(review.reviewedAt, timeZone) <= cycle.dueOn,
            );
            if (!context) {
              break;
            }

            const weight = profile.bodyMeasurements.findLast(
              (measurement) =>
                measurement.measuredOn > cycle.cycleStartsOn &&
                measurement.measuredOn <= cycle.dueOn,
            );
            const heightDate = localDateAt(profile.heightUpdatedAt, timeZone);
            const heightConfirmedAt =
              heightDate > cycle.cycleStartsOn && heightDate <= cycle.dueOn
                ? profile.heightUpdatedAt
                : null;
            const result = weight && heightConfirmedAt ? 'CUMPLIDO' : 'FALTA';

            const checkpoint = await tx.studentMeasurementCheckpoint.create({
              data: {
                studentId: profile.userId,
                routineId: context.routineId,
                routineVersionId: context.reviewedVersionId,
                cycleStartsOn: cycle.cycleStartsOn,
                dueOn: cycle.dueOn,
                result,
                weightMeasurementId: weight?.id ?? null,
                heightConfirmedAt,
                evaluatedAt,
              },
              select: { id: true },
            });
            checkpointsCreated += 1;
            consecutiveMisses = updateConsecutiveMisses(
              consecutiveMisses,
              result,
            );

            if (consecutiveMisses >= 3) {
              await tx.studentMeasurementBlock.create({
                data: {
                  studentId: profile.userId,
                  triggeringCheckpointId: checkpoint.id,
                  consecutiveMissesAtBlock: consecutiveMisses,
                  blockedAt: evaluatedAt,
                },
              });
              blocksCreated += 1;
              break;
            }
          }
        }

        return {
          checkpointsCreated,
          blocksCreated,
          skippedConcurrentRun: false,
        };
      },
      { maxWait: 5_000, timeout: 60_000 },
    );
  }
}
