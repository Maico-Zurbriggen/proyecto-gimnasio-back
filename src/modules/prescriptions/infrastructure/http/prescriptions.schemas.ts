import { z } from 'zod';

const uuid = z.string().uuid();
const templateUuid = z.uuid();

export const studentParamsSchema = z.object({ studentId: uuid });

export const routineParamsSchema = z.object({
  studentId: uuid,
  routineId: uuid,
});

export const templateParamsSchema = z.object({ templateId: templateUuid });

const templateSetSchema = z
  .object({
    minRepetitions: z.number().int().min(1),
    maxRepetitions: z.number().int().min(1),
    suggestedLoad: z.number().nonnegative().nullable().default(null),
    restSeconds: z.number().int().min(0),
    warmup: z.boolean(),
  })
  .refine((set) => set.minRepetitions <= set.maxRepetitions, {
    message: 'El mínimo de repeticiones no supera al máximo',
  });

const templateExerciseSchema = z.object({
  exerciseId: templateUuid,
  note: z.string().trim().max(500).nullable().default(null),
  sets: z.array(templateSetSchema).min(1).max(10),
});

const templateDaySchema = z.object({
  name: z.string().trim().min(1).max(80),
  exercises: z.array(templateExerciseSchema).min(1).max(20),
});

const routineTypeSchema = z.enum([
  'FUERZA',
  'HIPERTROFIA',
  'RESISTENCIA_MUSCULAR',
  'ACONDICIONAMIENTO_GENERAL',
]);

/** Cuerpo de creación y reemplazo total de una plantilla (RF-019, RF-020). */
export const writeTemplateBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  routineType: routineTypeSchema,
  days: z.array(templateDaySchema).min(1).max(7),
});

/**
 * Cuerpo de creación de una rutina manual del entrenador para su alumno:
 * tipo y días con ejercicios y series. La frecuencia objetivo es la cantidad
 * de días, igual que al asignar una plantilla (RF-022).
 */
export const manualRoutineBodySchema = z.object({
  routineType: routineTypeSchema,
  days: z.array(templateDaySchema).min(1).max(7),
});

export const assignRoutineBodySchema = z.object({
  templateId: uuid,
});

export const reviewRoutineBodySchema = z.object({
  confirmGoalMismatch: z.boolean().optional(),
  reviewToken: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  result: z.enum(['APROBADA', 'APROBADA_CON_CAMBIOS', 'RECHAZADA']),
  observation: z
    .string()
    .max(500, 'El motivo no puede tener más de 500 caracteres')
    .optional(),
});
