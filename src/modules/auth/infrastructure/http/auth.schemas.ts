import { z } from 'zod';

export const loginBodySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1).max(256),
  })
  .strict();

export type LoginBody = z.infer<typeof loginBodySchema>;
