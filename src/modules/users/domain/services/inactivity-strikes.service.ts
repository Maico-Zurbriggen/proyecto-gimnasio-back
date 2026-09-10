import {
  differenceInCalendarDays,
  DURACION_CICLO_DIAS,
} from '../../../routines/domain/services/routine-renewal';

/**
 * Un ciclo de rutina sin carga de datos equivale a una falta.
 *
 * Se expresa en DÍAS y se toma de `DURACION_CICLO_DIAS` para que exista una sola
 * fuente de verdad sobre cuánto dura un ciclo: si la duración cambia, las faltas
 * acompañan el cambio sin tocar este módulo.
 */
export const DAYS_PER_FALTA_CYCLE = DURACION_CICLO_DIAS;
export const FALTAS_THRESHOLD_FOR_BLOCK = 3; // 3ª falta consecutiva (180 días)

export interface InactivityEvaluationInput {
  consecutiveFaltas?: number;
  daysInactive?: number;
  lastDataDate?: Date;
  currentDate?: Date;
}

export interface InactivityEvaluationResult {
  consecutiveFaltas: number;
  daysInactive: number;
  shouldBlock: boolean;
  reason?: string;
}

/**
 * Calcula la cantidad de días calendario transcurridos entre dos fechas en UTC.
 * Nunca devuelve un valor negativo: una fecha futura cuenta como 0 días inactivo.
 */
export function calculateDaysBetween(fromDate: Date, toDate: Date): number {
  return Math.max(0, differenceInCalendarDays(toDate, fromDate));
}

/**
 * Calcula la cantidad de faltas consecutivas según los días transcurridos sin carga de datos.
 * - < 60 días: 0 faltas
 * - 60 a 119 días: 1ª falta
 * - 120 a 179 días: 2ª falta
 * - >= 180 días: 3 o más faltas (3ª falta consecutiva)
 */
export function calculateConsecutiveFaltasFromDays(
  daysInactive: number,
): number {
  if (daysInactive < DAYS_PER_FALTA_CYCLE) {
    return 0;
  }
  return Math.floor(daysInactive / DAYS_PER_FALTA_CYCLE);
}

/**
 * Determina si el usuario debe ser bloqueado por alcanzar la 3ª falta consecutiva.
 */
export function shouldBlockUser(consecutiveFaltas: number): boolean {
  return consecutiveFaltas >= FALTAS_THRESHOLD_FOR_BLOCK;
}

/**
 * Evalúa el estado de inactividad del usuario según faltas o fechas provistas.
 */
export function evaluateInactivity(
  input: InactivityEvaluationInput,
): InactivityEvaluationResult {
  let days = 0;
  let faltas = 0;

  if (typeof input.consecutiveFaltas === 'number') {
    faltas = Math.max(0, input.consecutiveFaltas);
    days =
      typeof input.daysInactive === 'number'
        ? input.daysInactive
        : faltas * DAYS_PER_FALTA_CYCLE;
  } else if (typeof input.daysInactive === 'number') {
    days = Math.max(0, input.daysInactive);
    faltas = calculateConsecutiveFaltasFromDays(days);
  } else if (input.lastDataDate && input.currentDate) {
    days = calculateDaysBetween(input.lastDataDate, input.currentDate);
    faltas = calculateConsecutiveFaltasFromDays(days);
  }

  const shouldBlock = shouldBlockUser(faltas);
  const reason = shouldBlock
    ? `Bloqueo de usuario por alcanzar la 3ª falta consecutiva tras ${String(
        FALTAS_THRESHOLD_FOR_BLOCK * DAYS_PER_FALTA_CYCLE,
      )} días o más sin actualización de datos solicitados.`
    : undefined;

  return {
    consecutiveFaltas: faltas,
    daysInactive: days,
    shouldBlock,
    reason,
  };
}
