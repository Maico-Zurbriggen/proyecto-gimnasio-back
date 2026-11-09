import { z } from 'zod';

export const sessionSetRecordSchema = z.object({
  position: z.number().int().positive(),
  prescribedExerciseId: z.uuid().nullable(),
  prescribedExerciseName: z.string().nullable(),
  prescribedExercisePosition: z.number().int().nullable(),
  prescribedSetPosition: z.number().int().nullable(),
  prescribedMinRepetitions: z.number().int().nullable(),
  prescribedMaxRepetitions: z.number().int().nullable(),
  prescribedLoad: z.number().nullable(),
  prescribedRestSeconds: z.number().int().nullable(),
  prescribedNote: z.string().nullable(),
  prescribedWarmup: z.boolean().nullable(),
  performedExerciseId: z.uuid().nullable(),
  performedExerciseName: z.string().nullable(),
  performedLoad: z.number().nullable(),
  performedRepetitions: z.number().int().nullable(),
  perceivedEffort: z.number().int().nullable(),
  warmup: z.boolean(),
  completed: z.boolean(),
  additional: z.boolean(),
  omissionReason: z.string().nullable(),
  atypicalConfirmed: z.boolean(),
});

const sessionFields = {
  id: z.uuid(),
  studentId: z.uuid(),
  routineId: z.uuid(),
  routineVersionId: z.uuid(),
  routineDayId: z.uuid(),
  routineDayName: z.string().nullable(),
  routineDayPosition: z.number().int().nullable(),
  routineVersionNumber: z.number().int().nullable(),
  durationSeconds: z.number().int().nonnegative().nullable(),
  timezone: z.string().nullable(),
  simulated: z.boolean(),
  snapshotComplete: z.boolean(),
  state: z.enum(['EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA']),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  occurredOn: z.iso.date(),
};

export const sessionSummarySchema = z.object({
  ...sessionFields,
  totalSeries: z.number().int().nonnegative(),
  completedSeries: z.number().int().nonnegative(),
});

export const sessionResponseSchemas = {
  SessionSetRecord: sessionSetRecordSchema,
  TrainingSessionSummary: sessionSummarySchema,
  TrainingSession: z.object({
    ...sessionFields,
    lastActivityAt: z.iso.datetime(),
    aptitudeWarning: z.enum(['AUSENTE', 'VENCIDA']).nullable(),
    compatibilityWarnings: z.array(
      z.object({ exerciseId: z.uuid(), state: z.string() }),
    ),
    setRecords: z.array(sessionSetRecordSchema),
  }),
  TrainingSessionPage: z.object({
    items: z.array(sessionSummarySchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    nextCursor: z.string().nullable(),
  }),
};
