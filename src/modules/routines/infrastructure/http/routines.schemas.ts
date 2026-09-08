import { z } from 'zod';

export const getActiveRoutineParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

export type GetActiveRoutineParams = z.infer<
  typeof getActiveRoutineParamsSchema
>;

