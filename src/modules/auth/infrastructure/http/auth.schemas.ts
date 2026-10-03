import { z } from 'zod';

/**
 * Credenciales de login (HU07 - T1).
 *
 * No se imponen reglas de complejidad al validar: la contraseña se compara contra
 * lo que el usuario tenga guardado, y exigir un formato acá sólo serviría para
 * revelar cómo son las contraseñas válidas del sistema.
 */
export const loginBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

export type LoginBody = z.infer<typeof loginBodySchema>;
