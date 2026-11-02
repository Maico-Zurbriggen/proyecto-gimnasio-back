import type { PrismaClient } from '@prisma/client';

import type {
  RoutineHistoryItem,
  RoutineHistoryRepository,
} from '../../application/ports/routine-history.repository';
import {
  buildRoutineHistory,
  type RoutineHistoryRow,
} from './build-routine-history';

export class PrismaRoutineHistoryRepository implements RoutineHistoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listByStudent(studentId: string): Promise<RoutineHistoryItem[]> {
    const routines = await this.prisma.routine.findMany({
      where: { studentId },
      orderBy: { requestedAt: 'desc' },
      select: {
        id: true,
        state: true,
        origin: true,
        routineType: true,
        targetWeeklyFrequency: true,
        requestedAt: true,
        requestedByUserId: true,
        sourceTemplateId: true,
        _count: { select: { versions: true } },
        reviews: {
          orderBy: { reviewedAt: 'asc' },
          select: {
            result: true,
            observation: true,
            reviewerTrainerId: true,
            reviewedAt: true,
          },
        },
        sourceGenerationResult: {
          select: {
            createdAt: true,
            structuredOutput: true,
            attempt: {
              select: {
                modelVersion: true,
                request: {
                  select: {
                    id: true,
                    preferences: true,
                    createdAt: true,
                    finishedAt: true,
                    _count: { select: { attempts: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const audits = routines.length
      ? await this.prisma.auditLog.findMany({
          where: {
            entityType: 'ROUTINE',
            entityId: { in: routines.map((routine) => routine.id) },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [];

    const rows: RoutineHistoryRow[] = routines.map((routine) => {
      const result = routine.sourceGenerationResult;
      const request = result?.attempt.request;
      return {
        id: routine.id,
        state: routine.state,
        origin: routine.origin,
        routineType: routine.routineType,
        targetWeeklyFrequency: routine.targetWeeklyFrequency,
        requestedAt: routine.requestedAt,
        requestedByUserId: routine.requestedByUserId,
        sourceTemplateId: routine.sourceTemplateId,
        versionCount: routine._count.versions,
        generation:
          result && request
            ? {
                requestId: request.id,
                preferences: request.preferences,
                requestCreatedAt: request.createdAt,
                requestFinishedAt: request.finishedAt,
                attempts: request._count.attempts,
                modelVersion: result.attempt.modelVersion,
                resultCreatedAt: result.createdAt,
                structuredOutput: result.structuredOutput,
              }
            : null,
        reviews: routine.reviews,
        audits: audits.filter((audit) => audit.entityId === routine.id),
      };
    });

    const userIds = new Set<string>();
    for (const row of rows) {
      if (row.requestedByUserId) userIds.add(row.requestedByUserId);
      row.reviews.forEach((review) => userIds.add(review.reviewerTrainerId));
      row.audits.forEach((audit) => userIds.add(audit.actorUserId));
    }
    const users = userIds.size
      ? await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, displayName: true },
        })
      : [];

    return buildRoutineHistory(
      rows,
      new Map(users.map((user) => [user.id, user.displayName])),
    );
  }
}
