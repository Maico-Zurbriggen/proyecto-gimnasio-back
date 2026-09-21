import { z } from 'zod';

import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  PESO_MAX_KG,
  PESO_MIN_KG,
} from '../../../measurements/domain/services/measurement-ranges';

export const studentParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

/**
 * Mismos rangos fisiológicos que valida el frontend (HU02, RN-15/16/17).
 *
 * Los límites vienen del servicio de dominio de HU02 para que exista una sola
 * fuente de verdad: el desbloqueo exige la misma medición que la carga ordinaria.
 */
export const unlockBodySchema = z.object({
  weightKg: z.number().min(PESO_MIN_KG).max(PESO_MAX_KG),
  heightCm: z.number().min(ALTURA_MIN_CM).max(ALTURA_MAX_CM),
});

export type UnlockBody = z.infer<typeof unlockBodySchema>;
