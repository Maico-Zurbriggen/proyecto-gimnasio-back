import { z } from 'zod';

export const invitationTokenParamSchema = z.object({
  token: z.string().min(1, 'El token de invitación es requerido'),
});

export const completeAccountBodySchema = z.object({
  displayName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede tener más de 100 caracteres'),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

export type CompleteAccountBody = z.infer<typeof completeAccountBodySchema>;
