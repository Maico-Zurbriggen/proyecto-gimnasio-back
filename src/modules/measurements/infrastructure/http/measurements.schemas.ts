import { z } from 'zod';

import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  PESO_MAX_KG,
  PESO_MIN_KG,
} from '../../domain/services/measurement-ranges';

export const measurementParamsSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

/**
 * Rangos fisiológicos del borde HTTP (HU02 - T2).
 *
 * Toma los límites del servicio de dominio para que exista una sola fuente de
 * verdad: el dominio vuelve a validarlos, de modo que la regla no depende del
 * transporte.
 */
export const recordMeasurementBodySchema = z.object({
  weightKg: z
    .number({ message: 'weightKg must be a number' })
    .min(PESO_MIN_KG)
    .max(PESO_MAX_KG),
  heightCm: z
    .number({ message: 'heightCm must be a number' })
    .min(ALTURA_MIN_CM)
    .max(ALTURA_MAX_CM),
});

export type MeasurementParams = z.infer<typeof measurementParamsSchema>;
export type RecordMeasurementBody = z.infer<typeof recordMeasurementBodySchema>;
