import { z } from 'zod';

export const inactivityCheckParamsSchema = z.object({
  userId: z.string().uuid({ message: 'userId must be a valid UUID' }),
});

export const inactivityCheckBodySchema = z.object({
  consecutiveFaltas: z.number().int().min(0).optional(),
  daysInactive: z.number().int().min(0).optional(),
  lastDataDate: z.string().datetime().optional(),
});

export type InactivityCheckParams = z.infer<typeof inactivityCheckParamsSchema>;
export type InactivityCheckBody = z.infer<typeof inactivityCheckBodySchema>;
