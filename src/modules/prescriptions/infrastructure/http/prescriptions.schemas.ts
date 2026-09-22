import { z } from 'zod';

const uuid = z.string().uuid();

export const studentParamsSchema = z.object({ studentId: uuid });

export const routineParamsSchema = z.object({
  studentId: uuid,
  routineId: uuid,
});

export const assignRoutineBodySchema = z.object({
  templateId: uuid,
});

export const reviewRoutineBodySchema = z.object({
  result: z.enum(['APROBADA', 'APROBADA_CON_CAMBIOS', 'RECHAZADA']),
  observation: z.string().max(500).optional(),
});
