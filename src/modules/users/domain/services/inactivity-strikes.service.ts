export const MONTHS_PER_FALTA_CYCLE = 3;
export const FALTAS_THRESHOLD_FOR_BLOCK = 3; // 3ª falta consecutiva (9 meses)

export interface InactivityEvaluationInput {
  consecutiveFaltas?: number;
  monthsInactive?: number;
  lastDataDate?: Date;
  currentDate?: Date;
}

export interface InactivityEvaluationResult {
  consecutiveFaltas: number;
  monthsInactive: number;
  shouldBlock: boolean;
  reason?: string;
}

/**
 * Calcula la cantidad de meses completos transcurridos entre dos fechas en UTC.
 */
export function calculateMonthsBetween(fromDate: Date, toDate: Date): number {
  const yearsDiff = toDate.getUTCFullYear() - fromDate.getUTCFullYear();
  const monthsDiff = toDate.getUTCMonth() - fromDate.getUTCMonth();
  let totalMonths = yearsDiff * 12 + monthsDiff;

  // Si el día del mes en toDate es menor que en fromDate, el mes no está cumplido todavía
  if (toDate.getUTCDate() < fromDate.getUTCDate()) {
    totalMonths -= 1;
  }

  return Math.max(0, totalMonths);
}

/**
 * Calcula la cantidad de faltas consecutivas según los meses transcurridos sin carga de datos.
 * - < 3 meses: 0 faltas
 * - 3 a 5 meses: 1ª falta
 * - 6 a 8 meses: 2ª falta
 * - >= 9 meses: 3 o más faltas (3ª falta consecutiva)
 */
export function calculateConsecutiveFaltasFromMonths(
  monthsInactive: number,
): number {
  if (monthsInactive < MONTHS_PER_FALTA_CYCLE) {
    return 0;
  }
  return Math.floor(monthsInactive / MONTHS_PER_FALTA_CYCLE);
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
  let months = 0;
  let faltas = 0;

  if (typeof input.consecutiveFaltas === 'number') {
    faltas = Math.max(0, input.consecutiveFaltas);
    months =
      typeof input.monthsInactive === 'number'
        ? input.monthsInactive
        : faltas * MONTHS_PER_FALTA_CYCLE;
  } else if (typeof input.monthsInactive === 'number') {
    months = Math.max(0, input.monthsInactive);
    faltas = calculateConsecutiveFaltasFromMonths(months);
  } else if (input.lastDataDate && input.currentDate) {
    months = calculateMonthsBetween(input.lastDataDate, input.currentDate);
    faltas = calculateConsecutiveFaltasFromMonths(months);
  }

  const shouldBlock = shouldBlockUser(faltas);
  const reason = shouldBlock
    ? 'Bloqueo de usuario por alcanzar la 3ª falta consecutiva tras 9 meses o más sin actualización de datos solicitados.'
    : undefined;

  return {
    consecutiveFaltas: faltas,
    monthsInactive: months,
    shouldBlock,
    reason,
  };
}
