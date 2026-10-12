import { z } from 'zod';

import { LARGO_MAXIMO_NOMBRE_GIMNASIO } from '../../domain/services/gym-provisioning';

/**
 * Alta de un gimnasio (HU13 - criterio 4): los tres campos son obligatorios y
 * cada falta se informa en su campo. Que la zona exista lo decide el catálogo
 * de la base en el caso de uso, que responde también con error en
 * `zonaHoraria` (criterio 5).
 */
export const provisionGymBodySchema = z.object({
  nombre: z
    .string({ message: 'El nombre del gimnasio es obligatorio' })
    .trim()
    .min(1, 'El nombre del gimnasio es obligatorio')
    .max(
      LARGO_MAXIMO_NOMBRE_GIMNASIO,
      `El nombre no puede tener más de ${String(LARGO_MAXIMO_NOMBRE_GIMNASIO)} caracteres`,
    ),
  zonaHoraria: z
    .string({ message: 'La zona horaria es obligatoria' })
    .trim()
    .min(1, 'La zona horaria es obligatoria'),
  correoAdministrador: z
    .string({ message: 'El correo del administrador es obligatorio' })
    .trim()
    .min(1, 'El correo del administrador es obligatorio')
    .email('El correo no tiene un formato válido'),
});

export const gymParamsSchema = z.object({
  gymId: z.string().uuid(),
});
