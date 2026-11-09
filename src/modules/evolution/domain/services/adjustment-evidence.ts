import { InvalidAdjustmentEvidenceError } from '../errors/proposal-errors';

/**
 * Contrato de evidencia de un ajuste (RN-84, RF-090).
 *
 * Cada ajuste persiste su `criterion` (qué regla/situación lo motiva) y su
 * `supportingData` (qué datos de evolución lo sustentan). El criterio es texto
 * legible para el entrenador, no un código interno. El dato es un objeto JSON
 * con al menos una clave de evidencia y sin secretos ni datos personales.
 *
 * Dominio puro: no importa Prisma, Express ni Zod.
 */

const MAX_CRITERION_LENGTH = 500;

const FORBIDDEN_DATA_KEYS = new Set([
  'password',
  'password_hash',
  'token',
  'token_hash',
  'email',
  'display_name',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Normaliza y valida el criterio motivador (RN-84). */
export function assertValidCriterion(criterion: unknown): string {
  if (typeof criterion !== 'string') {
    throw new InvalidAdjustmentEvidenceError(
      'criterion',
      'el criterio debe ser un texto no vacío',
    );
  }
  const normalized = criterion.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new InvalidAdjustmentEvidenceError(
      'criterion',
      'el criterio debe ser un texto no vacío',
    );
  }
  if (normalized.length > MAX_CRITERION_LENGTH) {
    throw new InvalidAdjustmentEvidenceError(
      'criterion',
      `el criterio no puede superar ${MAX_CRITERION_LENGTH} caracteres`,
    );
  }
  return normalized;
}

/** Valida el dato sustentante (RN-84): objeto con evidencia, sin secretos. */
export function assertValidSupportingData(
  supportingData: unknown,
): Record<string, unknown> {
  if (!isPlainObject(supportingData)) {
    throw new InvalidAdjustmentEvidenceError(
      'supportingData',
      'el dato sustentante debe ser un objeto JSON',
    );
  }
  const keys = Object.keys(supportingData);
  if (keys.length === 0) {
    throw new InvalidAdjustmentEvidenceError(
      'supportingData',
      'el dato sustentante debe declarar al menos una evidencia (RN-73: declarar, no inventar)',
    );
  }
  for (const key of keys) {
    if (FORBIDDEN_DATA_KEYS.has(key.toLowerCase())) {
      throw new InvalidAdjustmentEvidenceError(
        'supportingData',
        `el dato sustentante no puede incluir "${key}"`,
      );
    }
  }
  return supportingData;
}

/** Valida el par completo antes de persistir (T1). Devuelve valores normalizados. */
export function assertValidAdjustmentEvidence(
  criterion: unknown,
  supportingData: unknown,
): { criterion: string; supportingData: Record<string, unknown> } {
  return {
    criterion: assertValidCriterion(criterion),
    supportingData: assertValidSupportingData(supportingData),
  };
}

export type TrainingPurpose =
  | 'FUERZA'
  | 'HIPERTROFIA'
  | 'RESISTENCIA_MUSCULAR'
  | 'ACONDICIONAMIENTO_GENERAL';

/**
 * Criterio legible para un ajuste por cambio de objetivo (RN-89a, fila global).
 * No es el código `CAMBIO_OBJETIVO`: es la frase que el entrenador lee para
 * decidir con fundamento (FL-10, RF-090).
 */
export function buildGoalChangeCriterion(
  previousGoal: TrainingPurpose | null,
  newGoal: TrainingPurpose,
): string {
  const from = previousGoal ?? 'sin objetivo declarado';
  return assertValidCriterion(
    `Cambio de objetivo de ${from} a ${newGoal}: se propone el tipo de rutina ${newGoal} con su esquema de series, repeticiones y descansos (RN-89a).`,
  );
}

export interface GoalChangeEvidenceInput {
  goalId: string;
  previousGoal: TrainingPurpose | null;
  newGoal: TrainingPurpose;
  routineTypeBefore: string;
  exerciseCount: number;
  scheme: {
    minSets: number;
    maxSets: number;
    minRepetitions: number;
    maxRepetitions: number;
    restSeconds: number;
  };
}

/**
 * Dato sustentante para un ajuste por cambio de objetivo (RN-84).
 * Incluye anterior/nuevo, esquema propuesto y alcance: todo lo que el
 * entrenador necesita para aprobar con fundamento, sin datos personales.
 */
export function buildGoalChangeSupportingData(
  input: GoalChangeEvidenceInput,
): Record<string, unknown> {
  return assertValidSupportingData({
    motivo: 'CAMBIO_OBJETIVO',
    objetivoAnterior: input.previousGoal,
    objetivoNuevo: input.newGoal,
    tipoRutinaVigente: input.routineTypeBefore,
    tipoRutinaPropuesto: input.newGoal,
    esquemaPropuesto: input.scheme,
    ejerciciosAfectados: input.exerciseCount,
    goalId: input.goalId,
    requiereRevisionEntrenador: true,
  });
}
