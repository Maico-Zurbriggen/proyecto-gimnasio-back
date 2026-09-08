export enum EstadoAvisoRenovacion {
  PENDIENTE = 'pendiente',
  CERRADO_HOY = 'cerrado hoy',
  VENCIDO = 'vencido',
}

export type EstadoAviso = 'pendiente' | 'cerrado hoy' | 'vencido';

export interface RenewalNotice {
  estado: EstadoAvisoRenovacion;
  diasRestantes: number;
  fechaVencimiento: Date;
}

/**
 * Agrega meses a una fecha en UTC manejando desbordamientos de fin de mes
 * (ej: 31 de mayo + 3 meses = 31 de agosto; 31 de marzo + 3 meses = 30 de junio).
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();

  result.setUTCMonth(result.getUTCMonth() + months);

  // Si el día UTC cambió, hubo desbordamiento al mes siguiente (ej. 31 pasó a 1 de julio)
  // setUTCDate(0) ajusta al último día del mes deseado.
  if (result.getUTCDate() !== originalDay) {
    result.setUTCDate(0);
  }

  return result;
}

/**
 * Calcula la diferencia en días calendario entre dos fechas (target - from) en UTC.
 * Normalizado a medianoche UTC para garantizar consistencia independientemente de la zona horaria local.
 */
export function differenceInCalendarDays(targetDate: Date, fromDate: Date): number {
  const utcTarget = Date.UTC(
    targetDate.getUTCFullYear(),
    targetDate.getUTCMonth(),
    targetDate.getUTCDate(),
  );
  const utcFrom = Date.UTC(
    fromDate.getUTCFullYear(),
    fromDate.getUTCMonth(),
    fromDate.getUTCDate(),
  );

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((utcTarget - utcFrom) / msPerDay);
}

/**
 * Calcula la fecha de vencimiento para un ciclo de duración en meses (por defecto 3 meses).
 */
export function calculateRenewalDate(startDate: Date, cycleMonths = 3): Date {
  return addMonths(startDate, cycleMonths);
}

/**
 * Calcula los días restantes para la renovación a partir de la fecha de vencimiento y la fecha actual.
 * - Si fechaActual < fechaVencimiento: valor > 0
 * - Si fechaActual == fechaVencimiento: 0
 * - Si fechaActual > fechaVencimiento: valor < 0
 */
export function calculateDaysUntilRenewal(
  renewalDate: Date,
  currentDate: Date,
): number {
  return differenceInCalendarDays(renewalDate, currentDate);
}

/**
 * Define el estado del aviso según la fecha (pendiente / cerrado hoy / vencido).
 * - Pendiente: días restantes > 0 (la fecha de renovación es posterior a la actual)
 * - Cerrado hoy: días restantes === 0 (la renovación vence hoy)
 * - Vencido: días restantes < 0 (la fecha de renovación ya pasó)
 */
export function determineNoticeState(
  daysUntilRenewal: number,
): EstadoAvisoRenovacion {
  if (daysUntilRenewal > 0) {
    return EstadoAvisoRenovacion.PENDIENTE;
  }
  if (daysUntilRenewal === 0) {
    return EstadoAvisoRenovacion.CERRADO_HOY;
  }
  return EstadoAvisoRenovacion.VENCIDO;
}

/**
 * Servicio de dominio completo para derivar la información de renovación del ciclo.
 */
export function calculateRenewalNotice(
  startDate: Date,
  currentDate: Date,
  cycleMonths = 3,
): RenewalNotice {
  const fechaVencimiento = calculateRenewalDate(startDate, cycleMonths);
  const diasRestantes = calculateDaysUntilRenewal(fechaVencimiento, currentDate);
  const estado = determineNoticeState(diasRestantes);

  return {
    estado,
    diasRestantes,
    fechaVencimiento,
  };
}

