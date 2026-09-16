import { z } from 'zod';

export const studentParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

/** Mismos rangos fisiológicos que valida el frontend (HU02, RN-15/16/17). */
export const unlockBodySchema = z.object({
  weightKg: z.number().min(20).max(250),
  heightCm: z.number().min(100).max(250),
});

export type UnlockBody = z.infer<typeof unlockBodySchema>;
