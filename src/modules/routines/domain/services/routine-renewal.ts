/**
 * Duración del ciclo de rutina, en días calendario (HU01 - T1).
 *
 * El ciclo se expresa en DÍAS, no en meses calendario: 60 días es una duración
 * fija, mientras que "2 meses" varía entre 59 y 62 días según el mes de inicio.
 * Una duración fija hace que la fecha de vencimiento sea predecible y que el
 * aviso de renovación se comporte igual para todos los alumnos.
 *
 * [SUPUESTO] Este valor no proviene del corpus documental: lo pidió el usuario
 * final (cátedra) y no tiene respaldo en D5/RN-39a, que define para cada tipo de
 * rutina frecuencia, series, repeticiones y descansos, pero no duración. En D6/§2
 * una rutina vigente no vence: se archiva cuando otra entra en vigencia.
 * Registrar en `planning/risks-and-assumptions.md` cuando se actualice el corpus.
 */
export const DURACION_CICLO_DIAS = 60;

/**
 * Días de antelación con que se muestra el aviso de renovación (HU01 - T6).
 *
 * Con un ciclo de 60 días: iniciado hace 52 días o menos no hay aviso (quedan 8
 * o más); iniciado hace 53 días o más sí lo hay (quedan 7 o menos).
 */
export const DIAS_ANTELACION_AVISO = 7;

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
 * Agrega días calendario a una fecha en UTC.
 *
 * `setUTCDate` normaliza por sí mismo el desborde de mes y de año, y al operar
 * siempre en UTC el resultado no depende de la zona horaria local ni del horario
 * de verano.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Calcula la diferencia en días calendario entre dos fechas (target - from) en UTC.
 * Normalizado a medianoche UTC para garantizar consistencia independientemente de la zona horaria local.
 */
export function differenceInCalendarDays(
  targetDate: Date,
  fromDate: Date,
): number {
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
 * Calcula la fecha de vencimiento del ciclo (por defecto, 90 días).
 */
export function calculateRenewalDate(
  startDate: Date,
  cycleDays: number = DURACION_CICLO_DIAS,
): Date {
  return addDays(startDate, cycleDays);
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
 * Determina si corresponde mostrar el aviso de renovación (HU01, Esc. 1 a 4).
 *
 * Regla de dominio: no se expone en la respuesta del endpoint. El aviso y su
 * reaparición diaria son HU01/T4 y T5, que son frontend.
 *
 * Se muestra cuando faltan 7 días o menos, incluido el día del vencimiento y
 * todos los posteriores mientras el ciclo siga sin renovarse.
 */
export function shouldDisplayNotice(
  daysUntilRenewal: number,
  noticeLeadDays: number = DIAS_ANTELACION_AVISO,
): boolean {
  return daysUntilRenewal <= noticeLeadDays;
}

/**
 * Determina si el aviso puede descartarse (HU01, Esc. 2.1 y 4).
 *
 * Regla de dominio: no se expone en la respuesta del endpoint. Ver HU01/T4.
 *
 * Un aviso vencido no se descarta: permanece visible hasta que se genere la
 * rutina nueva. Los estados `pendiente` y `cerrado hoy` sí son descartables.
 */
export function isNoticeDismissible(estado: EstadoAvisoRenovacion): boolean {
  return estado !== EstadoAvisoRenovacion.VENCIDO;
}

/**
 * Servicio de dominio completo para derivar la información de renovación del ciclo.
 */
export function calculateRenewalNotice(
  startDate: Date,
  currentDate: Date,
  cycleDays: number = DURACION_CICLO_DIAS,
): RenewalNotice {
  const fechaVencimiento = calculateRenewalDate(startDate, cycleDays);
  const diasRestantes = calculateDaysUntilRenewal(
    fechaVencimiento,
    currentDate,
  );
  const estado = determineNoticeState(diasRestantes);

  return {
    estado,
    diasRestantes,
    fechaVencimiento,
  };
}
