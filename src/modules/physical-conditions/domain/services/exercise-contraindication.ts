import type { Severidad, ZonaCorporal } from './body-zones';

/**
 * Contraindicación de un ejercicio por condición física (RN-44a, RN-44b).
 *
 * Un ejercicio está contraindicado cuando involucra la zona de una condición
 * vigente. La severidad decide el efecto: LEVE **señala** y MODERADA o SEVERA
 * **impiden** la puesta en vigencia (criterio 22).
 *
 * La regla es pura: no consulta la base ni el reloj. Recibe lo que ya se leyó.
 */

/** Estado de compatibilidad persistido en la rutina (D6 §7). */
export type EstadoCompatibilidad =
  'COMPATIBLE' | 'ADVERTIDO' | 'INCOMPATIBLE' | 'EJERCICIO_DESACTIVADO';

/**
 * Prefijo de los motivos que escribe esta regla.
 *
 * Permite revertir **sólo** lo que marcó una condición cuando ésta se cierra,
 * sin pisar un INCOMPATIBLE puesto por falta de equipamiento (RN-44d) o por un
 * ejercicio dado de baja. Es el mismo recaudo que toma el inventario.
 */
export const MOTIVO_CONDICION = 'Condicion';

/** Zonas que un ejercicio involucra: sus músculos y sus articulaciones. */
export interface ZonasDelEjercicio {
  musculos: readonly string[];
  articulaciones: readonly string[];
}

/** Condición vigente, reducida a lo que la regla necesita. */
export interface CondicionVigente {
  bodyZoneCode: ZonaCorporal;
  severity: Severidad;
}

function involucra(zonas: ZonasDelEjercicio, zona: ZonaCorporal): boolean {
  return zonas.musculos.includes(zona) || zonas.articulaciones.includes(zona);
}

/** `true` si la severidad impide la vigencia (RN-44b). */
export function impideVigencia(severidad: Severidad): boolean {
  return severidad === 'MODERADA' || severidad === 'SEVERA';
}

export interface Contraindicacion {
  estado: 'ADVERTIDO' | 'INCOMPATIBLE';
  motivo: string;
}

/**
 * Evalúa un ejercicio contra las condiciones vigentes del alumno.
 *
 * `null` cuando ninguna condición lo alcanza. Si varias lo alcanzan, gana la
 * más restrictiva: una rodilla LEVE y un hombro MODERADO en un mismo ejercicio
 * lo dejan INCOMPATIBLE, porque la severidad mayor es la que manda.
 */
export function evaluarContraindicacion(
  zonas: ZonasDelEjercicio,
  condiciones: readonly CondicionVigente[],
): Contraindicacion | null {
  const alcanzan = condiciones.filter((condicion) =>
    involucra(zonas, condicion.bodyZoneCode),
  );
  if (alcanzan.length === 0) {
    return null;
  }

  const impeditiva = alcanzan.find((condicion) =>
    impideVigencia(condicion.severity),
  );
  if (impeditiva) {
    return {
      estado: 'INCOMPATIBLE',
      motivo: `${MOTIVO_CONDICION} ${impeditiva.severity} en ${impeditiva.bodyZoneCode} impide la vigencia (RN-44b).`,
    };
  }

  const leve = alcanzan[0];
  if (!leve) {
    return null;
  }
  return {
    estado: 'ADVERTIDO',
    motivo: `${MOTIVO_CONDICION} LEVE en ${leve.bodyZoneCode}: se senala, no impide (RN-44b).`,
  };
}

/**
 * Qué hacer con un ejercicio ya marcado, dada su contraindicación actual.
 *
 * Devuelve `null` cuando no hay nada que cambiar, para no escribir de más.
 *
 * Sólo se revierte lo que esta misma regla marcó: un INCOMPATIBLE por
 * equipamiento ausente sobrevive al cierre de una condición, porque esa causa
 * sigue vigente y no es asunto de HU11.
 */
export function proximoEstado(
  actual: { estado: EstadoCompatibilidad; motivo: string | null },
  contraindicacion: Contraindicacion | null,
): { estado: EstadoCompatibilidad; motivo: string | null } | null {
  const loMarcoUnaCondicion =
    actual.motivo?.startsWith(MOTIVO_CONDICION) ?? false;

  if (contraindicacion === null) {
    if (!loMarcoUnaCondicion) {
      return null;
    }
    return { estado: 'COMPATIBLE', motivo: null };
  }

  if (
    actual.estado === contraindicacion.estado &&
    actual.motivo === contraindicacion.motivo
  ) {
    return null;
  }

  // Un ejercicio desactivado del catálogo no se "mejora" a ADVERTIDO: esa causa
  // es independiente de las condiciones y tiene prioridad.
  if (actual.estado === 'EJERCICIO_DESACTIVADO') {
    return null;
  }

  // Un INCOMPATIBLE por otra causa (equipamiento) no baja a ADVERTIDO.
  if (
    actual.estado === 'INCOMPATIBLE' &&
    !loMarcoUnaCondicion &&
    contraindicacion.estado === 'ADVERTIDO'
  ) {
    return null;
  }

  return { estado: contraindicacion.estado, motivo: contraindicacion.motivo };
}
