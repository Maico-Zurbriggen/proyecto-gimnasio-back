import { z } from 'zod';

export const invitationTokenParamSchema = z.object({
  token: z.string().min(1, 'El token de invitación es requerido').max(256),
});

export const invitationIdParamSchema = z.object({
  invitationId: z.string().uuid(),
});

/**
 * El cuerpo sólo exige que los campos estén y tengan un largo razonable; cada
 * falta se informa en su propio campo (criterio 13). La fortaleza de la
 * contraseña la decide el dominio (T4), para que la respuesta enumere los
 * requisitos incumplidos.
 *
 * Cualquier otro campo —por ejemplo `roles`— se descarta: los roles salen de la
 * invitación (RA-09, criterio 8).
 */
export const completeAccountBodySchema = z.object({
  displayName: z
    .string({ message: 'El nombre es obligatorio' })
    .trim()
    .min(1, 'El nombre es obligatorio')
    .max(100, 'El nombre no puede tener más de 100 caracteres'),
  password: z
    .string({ message: 'La contraseña es obligatoria' })
    .min(1, 'La contraseña es obligatoria')
    .max(256, 'La contraseña es demasiado larga'),
  /** FL-19/3: separado y opcional; sin él la cuenta se crea igual (A2). */
  healthDataConsent: z.boolean().optional(),
});

export type CompleteAccountBody = z.infer<typeof completeAccountBodySchema>;

/** Emisión (FL-19/1): el gimnasio sale del emisor, nunca del pedido. */
export const issueInvitationBodySchema = z.object({
  email: z
    .string({ message: 'El correo es obligatorio' })
    .trim()
    .min(1, 'El correo es obligatorio')
    .email('El correo no tiene un formato válido'),
  roles: z
    .array(z.enum(['ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR']), {
      message: 'Elegí al menos un rol',
    })
    .min(1, 'Elegí al menos un rol')
    .default(['ALUMNO']),
});
