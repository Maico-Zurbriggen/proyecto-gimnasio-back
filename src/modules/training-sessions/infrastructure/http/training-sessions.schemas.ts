import { z } from 'zod';

const uuid = z.string().uuid();

export const studentParamsSchema = z.object({ studentId: uuid });

export const sessionParamsSchema = z.object({
  studentId: uuid,
  sessionId: uuid,
});

export const seriesParamsSchema = z.object({
  studentId: uuid,
  sessionId: uuid,
  position: z.coerce.number().int().min(1),
});

/**
 * Inicio de sesión (RF-027, FL-05 pasos 1 a 4).
 * El alumno confirma o elige el día; sin día se propone el siguiente del ciclo.
 */
export const startSessionBodySchema = z
  .object({
    routineDayId: uuid.optional(),
  })
  .strict();

/** Historial paginado (RF-035): filtros por estado y rango de ocurrencia. */
export const listSessionsQuerySchema = z.object({
  state: z
    .enum(['EN_CURSO', 'COMPLETADA', 'ABANDONADA', 'BLOQUEADA'])
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'from debe ser una fecha YYYY-MM-DD',
    })
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'to debe ser una fecha YYYY-MM-DD',
    })
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>;

/**
 * Registro de una serie (RF-029, RN-55, RN-55a).
 * Sólo valores ejecutados: la prescripción congelada nunca se modifica (RN-61).
 */
export const updateSeriesBodySchema = z
  .object({
    performedLoad: z.number().min(0).max(1000).nullable().optional(),
    performedRepetitions: z
      .number()
      .int()
      .min(1)
      .max(100)
      .nullable()
      .optional(),
    perceivedEffort: z.number().int().min(1).max(10).nullable().optional(),
    completed: z.boolean().optional(),
    additional: z.boolean().optional(),
    omissionReason: z.string().trim().max(500).nullable().optional(),
    performedExerciseId: uuid.nullable().optional(),
    atypicalConfirmed: z.boolean().optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'Se requiere al menos un campo para actualizar la serie',
  });

export type StartSessionBody = z.infer<typeof startSessionBodySchema>;
export type UpdateSeriesBody = z.infer<typeof updateSeriesBodySchema>;
