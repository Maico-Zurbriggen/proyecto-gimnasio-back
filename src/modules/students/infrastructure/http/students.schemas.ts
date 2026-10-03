import { z } from 'zod';

export const studentParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});
