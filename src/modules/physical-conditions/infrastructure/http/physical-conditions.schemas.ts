import { z } from 'zod';

import {
  SEVERIDADES,
  ZONAS_CORPORALES,
} from '../../domain/services/body-zones';

export const studentParamSchema = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

export const conditionParamsSchema = studentParamSchema.extend({
  conditionId: z.string().uuid({ message: 'conditionId must be a valid UUID' }),
});

const diaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD');

/**
 * Zona corporal y severidad **tipadas** contra las enumeraciones cerradas de D2
 * (RN-10a). La descripción libre es opcional y complementaria: no participa de
 * ningún cálculo.
 */
export const declareConditionBodySchema = z.object({
  bodyZoneCode: z.enum(ZONAS_CORPORALES),
  severity: z.enum(SEVERIDADES),
  description: z.string().max(500).optional(),
  startsOn: diaSchema.optional(),
});

export const closeConditionBodySchema = z.object({
  endsOn: diaSchema.optional(),
});

/**
 * Revisión de una condición vigente (criterio 14). Los tres campos son
 * opcionales —se conserva lo que no se envía— pero al menos uno debe venir:
 * una revisión que no cambia nada sólo cerraría la condición sin motivo.
 */
export const reviseConditionBodySchema = z
  .object({
    bodyZoneCode: z.enum(ZONAS_CORPORALES).optional(),
    severity: z.enum(SEVERIDADES).optional(),
    description: z.string().max(500).nullable().optional(),
  })
  .refine(
    (body) =>
      body.bodyZoneCode !== undefined ||
      body.severity !== undefined ||
      body.description !== undefined,
    { message: 'Indicá al menos un campo a revisar' },
  );

export const listConditionsQuerySchema = z.object({
  vigentesEn: diaSchema.optional(),
});
