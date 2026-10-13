/**
 * Vocabulario tipado de las condiciones físicas (HU11 - T1).
 *
 * La zona corporal y la severidad son **tipadas**, no texto libre: es lo que
 * hace calculable la contraindicación de RN-44a. La descripción libre es
 * complementaria y no participa de ningún cálculo (RN-10a).
 */

/** Grupos musculares — D2/§4.2, 17 valores. */
export const GRUPOS_MUSCULARES = [
  'PECTORAL',
  'DELTOIDES_ANTERIOR',
  'DELTOIDES_LATERAL',
  'BICEPS',
  'ANTEBRAZO',
  'ABDOMINALES',
  'OBLICUOS',
  'CUADRICEPS',
  'ADUCTORES',
  'DORSAL',
  'TRAPECIO',
  'DELTOIDES_POSTERIOR',
  'TRICEPS',
  'ERECTORES_LUMBARES',
  'GLUTEO',
  'ISQUIOTIBIALES',
  'GEMELOS',
] as const;

/** Articulaciones — D2/§4.3, 8 valores. */
export const ARTICULACIONES = [
  'HOMBRO',
  'CODO',
  'MUNECA',
  'COLUMNA_CERVICAL',
  'COLUMNA_LUMBAR',
  'CADERA',
  'RODILLA',
  'TOBILLO',
] as const;

/**
 * Zona corporal = unión de grupos musculares y articulaciones.
 *
 * 25 valores en total (D2/§4.3). Es el vocabulario que vincula una condición
 * física con un ejercicio.
 */
export const ZONAS_CORPORALES = [
  ...GRUPOS_MUSCULARES,
  ...ARTICULACIONES,
] as const;

export type ZonaCorporal = (typeof ZONAS_CORPORALES)[number];

/** Severidad — D2/§4.6. `LEVE` advierte; `MODERADA` y `SEVERA` impiden. */
export const SEVERIDADES = ['LEVE', 'MODERADA', 'SEVERA'] as const;

export type Severidad = (typeof SEVERIDADES)[number];

/** `true` si el código pertenece a la enumeración cerrada de zonas. */
export function esZonaCorporalValida(codigo: string): codigo is ZonaCorporal {
  return (ZONAS_CORPORALES as readonly string[]).includes(codigo);
}

/**
 * `true` si la severidad impide poner una rutina en vigencia (RN-44b).
 *
 * No se usa todavía en este módulo: lo consume la verificación de
 * compatibilidad. Vive acá porque es la regla que da sentido a la severidad.
 */
export function severidadImpide(severidad: Severidad): boolean {
  return severidad === 'MODERADA' || severidad === 'SEVERA';
}
