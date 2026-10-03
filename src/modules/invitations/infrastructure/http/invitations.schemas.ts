import { z } from 'zod';

export const invitationTokenParamSchema = z.object({
  token: z.string().min(1, 'El token de invitación es requerido'),
});

/**
 * El cuerpo sólo exige que los campos estén y tengan un largo razonable. La
 * fortaleza de la contraseña la decide el dominio (HU06 - T4), para que la
 * respuesta pueda enumerar los requisitos incumplidos en lugar de un 400 opaco.
 */
export const completeAccountBodySchema = z.object({
  displayName: z
    .string()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede tener más de 100 caracteres'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

export type CompleteAccountBody = z.infer<typeof completeAccountBodySchema>;
