/**
 * Reglas puras del ciclo de vida de la sesión (D6/§4, RN-50 a RN-61).
 *
 * No hay estado PAUSADA: pausar es una acción local del cliente (CB-25, FL-07).
 * El backend sólo conoce EN_CURSO, COMPLETADA, ABANDONADA y BLOQUEADA.
 */

export const INACTIVITY_ABANDON_HOURS = 8;
export const COMPLETED_CORRECTION_HOURS = 48;

export const SERIES_RANGES = {
  loadMin: 0,
  loadMax: 1000,
  repsMin: 1,
  repsMax: 100,
  effortMin: 1,
  effortMax: 10,
} as const;

export const ATYPICAL_LOAD_FACTOR = 1.5;

export function isInactiveSince(
  lastActivityAt: Date,
  now: Date,
  hours = INACTIVITY_ABANDON_HOURS,
): boolean {
  return now.getTime() - lastActivityAt.getTime() >= hours * 3_600_000;
}

export function isBeyondCorrectionWindow(
  completedAt: Date,
  now: Date,
  hours = COMPLETED_CORRECTION_HOURS,
): boolean {
  return now.getTime() - completedAt.getTime() >= hours * 3_600_000;
}

export interface SeriesAttempt {
  performedLoad: number | null | undefined;
  performedRepetitions: number | null | undefined;
  perceivedEffort: number | null | undefined;
}

/** RN-55: rangos admisibles al registrar una serie. */
export function validateSeriesRanges(attempt: SeriesAttempt): string[] {
  const violations: string[] = [];
  if (
    attempt.performedLoad !== null &&
    attempt.performedLoad !== undefined &&
    (Number.isNaN(attempt.performedLoad) ||
      attempt.performedLoad < SERIES_RANGES.loadMin ||
      attempt.performedLoad > SERIES_RANGES.loadMax)
  ) {
    violations.push(
      `carga debe estar entre ${SERIES_RANGES.loadMin} y ${SERIES_RANGES.loadMax} kg`,
    );
  }
  if (
    attempt.performedRepetitions !== null &&
    attempt.performedRepetitions !== undefined &&
    (!Number.isInteger(attempt.performedRepetitions) ||
      attempt.performedRepetitions < SERIES_RANGES.repsMin ||
      attempt.performedRepetitions > SERIES_RANGES.repsMax)
  ) {
    violations.push(
      `repeticiones debe estar entre ${SERIES_RANGES.repsMin} y ${SERIES_RANGES.repsMax}`,
    );
  }
  if (
    attempt.perceivedEffort !== null &&
    attempt.perceivedEffort !== undefined &&
    (!Number.isInteger(attempt.perceivedEffort) ||
      attempt.perceivedEffort < SERIES_RANGES.effortMin ||
      attempt.perceivedEffort > SERIES_RANGES.effortMax)
  ) {
    violations.push(
      `esfuerzo percibido debe estar entre ${SERIES_RANGES.effortMin} y ${SERIES_RANGES.effortMax}`,
    );
  }
  return violations;
}

/**
 * RN-55a: carga superior al 150% del mejor histórico exige confirmación.
 * Sin histórico no hay atipicidad: la primera marca nunca es atípica.
 */
export function isAtypicalLoad(
  attemptedLoad: number | null | undefined,
  bestHistoricalLoad: number | null,
): boolean {
  if (attemptedLoad === null || attemptedLoad === undefined) return false;
  if (bestHistoricalLoad === null || bestHistoricalLoad <= 0) return false;
  return attemptedLoad > bestHistoricalLoad * ATYPICAL_LOAD_FACTOR;
}

/**
 * El CHECK `session_set_records_completed_data_check` exige ejercicio
 * ejecutado, carga y repeticiones cuando la serie queda completada.
 * Se valida en el dominio para responder 400 en vez de 500.
 */
export function validateCompletedSeries(input: {
  completed: boolean;
  performedExerciseId: string | null;
  performedLoad: number | null | undefined;
  performedRepetitions: number | null | undefined;
}): string[] {
  if (!input.completed) return [];
  const violations: string[] = [];
  if (input.performedLoad === null || input.performedLoad === undefined) {
    violations.push(
      'la carga ejecutada es obligatoria en una serie completada',
    );
  }
  if (
    input.performedRepetitions === null ||
    input.performedRepetitions === undefined
  ) {
    violations.push(
      'las repeticiones ejecutadas son obligatorias en una serie completada',
    );
  }
  if (input.performedExerciseId === null) {
    violations.push(
      'el ejercicio ejecutado es obligatorio en una serie completada',
    );
  }
  return violations;
}

/** Redondeo único al ingresar (D2/§3): dos decimales, nunca en cada cálculo. */
export function roundLoadToCent(load: number): number {
  return Math.round(load * 100) / 100;
}
