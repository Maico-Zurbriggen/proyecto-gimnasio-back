import { z } from 'zod';

export const requestGenerationParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

export const requestGenerationParametrosSchema = z
  .object({
    objetivo: z.string().min(1),
    frecuenciaSemanal: z.number().int().min(1).max(7),
    duracionMinutos: z.number().int().positive(),
    restricciones: z.array(z.string()).default([]),
    confianza: z.number().min(0).max(1).default(1),
  })
  .strict();

export const requestGenerationBodySchema = z
  .object({
    textoLibre: z.string().min(1).nullish(),
    parametros: requestGenerationParametrosSchema.nullish(),
    idempotencyKey: z.string().min(1).optional(),
  })
  .strict();

export const getGenerationParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
  requestId: z.string().uuid({ message: 'requestId must be a valid UUID' }),
});

export type RequestGenerationParams = z.infer<
  typeof requestGenerationParamsSchema
>;
export type RequestGenerationBody = z.infer<typeof requestGenerationBodySchema>;
export type GetGenerationParams = z.infer<typeof getGenerationParamsSchema>;
