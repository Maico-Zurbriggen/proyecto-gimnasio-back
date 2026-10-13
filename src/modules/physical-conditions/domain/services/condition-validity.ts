import type { Severidad, ZonaCorporal } from './body-zones';

/**
 * Vigencia de las condiciones físicas (HU11 - T2).
 *
 * Funciones puras sobre fechas: permiten responder **qué condiciones regían en
 * una fecha dada**, que es lo que exige RF-085 y lo que sostiene toda auditoría
 * de una prescripción pasada.
 */

/** Condición física con su período de vigencia. */
export interface CondicionFisica {
  id: string;
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
  description: string | null;
  startsOn: Date;
  endsOn: Date | null;
}

/** Compara dos fechas por día calendario, en UTC. */
function diaUtc(fecha: Date): number {
  return Date.UTC(
    fecha.getUTCFullYear(),
    fecha.getUTCMonth(),
    fecha.getUTCDate(),
  );
}

/**
 * `true` si la condición regía en la fecha indicada.
 *
 * Vigente es la que empezó en esa fecha o antes y no terminó, o terminó
 * después (RN-10). El día de inicio cuenta; el de cierre también, porque la
 * condición estuvo vigente ese día.
 */
export function estabaVigenteEn(
  condicion: Pick<CondicionFisica, 'startsOn' | 'endsOn'>,
  fecha: Date,
): boolean {
  const dia = diaUtc(fecha);

  if (diaUtc(condicion.startsOn) > dia) {
    return false;
  }
  if (condicion.endsOn === null) {
    return true;
  }
  return diaUtc(condicion.endsOn) >= dia;
}

/** Condiciones que regían en una fecha dada. */
export function vigentesEn<
  T extends Pick<CondicionFisica, 'startsOn' | 'endsOn'>,
>(condiciones: readonly T[], fecha: Date): T[] {
  return condiciones.filter((condicion) => estabaVigenteEn(condicion, fecha));
}

/**
 * `true` si la condición puede cerrarse en la fecha indicada.
 *
 * No se cierra una ya cerrada, ni en una fecha anterior o igual a su inicio: la
 * base exige `ends_on > starts_on` (restricción `physical_conditions_valid_
 * period_check`), de modo que una condición declarada hoy se cierra desde
 * mañana. Un período de duración cero no es interpretable (RI-17).
 */
export function puedeCerrarse(
  condicion: Pick<CondicionFisica, 'startsOn' | 'endsOn'>,
  fechaDeCierre: Date,
): boolean {
  if (condicion.endsOn !== null) {
    return false;
  }
  return diaUtc(fechaDeCierre) > diaUtc(condicion.startsOn);
}

/**
 * `true` si la fecha de inicio es admisible.
 *
 * No se aceptan condiciones con fecha futura: el sistema registra lo que pasa,
 * no lo que va a pasar (mismo criterio que RN-16 para las mediciones).
 */
export function fechaDeInicioAdmisible(startsOn: Date, hoy: Date): boolean {
  return diaUtc(startsOn) <= diaUtc(hoy);
}
