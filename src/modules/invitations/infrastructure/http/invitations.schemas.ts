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

export const invitationIdParamSchema = z.object({
  invitationId: z
    .string()
    .uuid({ message: 'invitationId must be a valid UUID' }),
});

/**
 * Cuerpo de emisión de una invitación (HU08 - T1).
 *
 * El gimnasio **no** es un parámetro: sale del emisor (criterio 5). Los roles se
 * validan además en el dominio, que es quien decide cuáles puede otorgar cada
 * emisor (criterio 2).
 */
export const issueInvitationBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'El correo es requerido')
    .email('El correo no tiene un formato válido'),
  roles: z
    .array(z.enum(['ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR']))
    .min(1, 'Hay que indicar al menos un rol'),
});

export type IssueInvitationBody = z.infer<typeof issueInvitationBodySchema>;
