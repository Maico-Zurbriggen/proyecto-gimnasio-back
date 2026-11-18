import { z } from 'zod';
import { ADAPTATION_DEMO_SCENARIOS } from '../../domain/services/adaptation-demo';

export const adaptationDemoScenarioSchema = z.enum(ADAPTATION_DEMO_SCENARIOS);
export const adaptationDemoParamsSchema = z.object({
  studentId: z.string().uuid(),
});
export const prepareAdaptationDemoSchema = z
  .object({ scenario: adaptationDemoScenarioSchema })
  .strict();
export const adaptationDemoResultSchema = z.object({
  runId: z.string().uuid(),
  studentId: z.string().uuid(),
  scenario: adaptationDemoScenarioSchema,
  diagnosticId: z.string().uuid(),
  globalSituation: z.enum([
    'DATOS_INSUFICIENTES',
    'SOBREEXIGENCIA',
    'PROGRESION_ADECUADA',
    'ESTIMULO_INSUFICIENTE',
    'ESTANCAMIENTO',
  ]),
  proposalId: z.string().uuid().nullable(),
  proposalState: z.string().nullable(),
  proposalStatus: z.enum(['PROPUESTA', 'SIN_AJUSTES', 'DATOS_INSUFICIENTES']),
  preparedOn: z.string(),
  reused: z.boolean(),
});
export const adaptationDemoStudentSchema = z.object({
  studentId: z.string().uuid(),
  displayName: z.string(),
  hasCurrentRoutine: z.boolean(),
  activeRun: adaptationDemoResultSchema.nullable(),
});
export const adaptationDemoListSchema = z.object({
  students: z.array(adaptationDemoStudentSchema),
});
export const adaptationDemoRestoreSchema = z.object({ restored: z.boolean() });
