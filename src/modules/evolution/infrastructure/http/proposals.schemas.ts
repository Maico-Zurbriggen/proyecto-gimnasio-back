import { z } from 'zod';

export const proposalParamsSchema = z.object({
  proposalId: z.string().uuid({ message: 'proposalId must be a valid UUID' }),
});

export const resolutionBodySchema = z.object({
  decision: z.enum(['ACEPTADA_TOTAL', 'ACEPTADA_PARCIAL', 'RECHAZADA']),
  acceptedAdjustmentIds: z.array(z.string().uuid()).optional(),
  reason: z.string().max(1000).optional(),
});

export type ResolutionBody = z.infer<typeof resolutionBodySchema>;
