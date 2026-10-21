/**
 * Precarga de los valores de una serie (HU22 - T2, RF-030).
 *
 * Cada serie se presenta con los valores de la última ejecución del alumno en
 * ese ejercicio, para que registrarla cueste dos interacciones (RNF-07).
 *
 * La regla que gobierna el caso difícil es CB-09 (FL-05/A4): cuando no hay
 * historial, se precarga la carga sugerida de la prescripción o el campo queda
 * vacío, pero **nunca cero**. Un cero es un valor legible —RN-55 admite cargas
 * desde 0,00 kg para el peso corporal— así que precargarlo por falta de datos
 * haría que el alumno confirme sin mirar un dato que el sistema inventó.
 * Ausencia y cero son cosas distintas y acá se mantienen distintas.
 */

/** Rangos de RN-55: lo que el sistema admite al registrar una serie. */
export const CARGA_MINIMA = 0;
export const CARGA_MAXIMA = 1000;
export const REPETICIONES_MINIMAS = 1;
export const REPETICIONES_MAXIMAS = 100;

/** Una ejecución previa del alumno en un ejercicio. */
export interface EjecucionPrevia {
  exerciseId: string;
  /** Fecha en que ocurrió la sesión, no la de registro (RN-59). */
  occurredOn: Date;
  carga: number | null;
  repeticiones: number | null;
}

/** La serie tal como quedó congelada al iniciar la sesión (RN-52). */
export interface SeriePrescripta {
  position: number;
  exerciseId: string;
  repeticionesMinimas: number;
  repeticionesMaximas: number;
  /** Carga sugerida por la prescripción. `null` si la prescripción no fija una. */
  cargaSugerida: number | null;
  warmup: boolean;
}

/** De dónde salió cada valor precargado. */
export type OrigenDePrecarga =
  'ULTIMA_EJECUCION' | 'CARGA_SUGERIDA' | 'SIN_DATOS';

export interface SeriePrecargada {
  position: number;
  exerciseId: string;
  repeticionesMinimas: number;
  repeticionesMaximas: number;
  warmup: boolean;
  /**
   * Valores propuestos. `null` significa «campo vacío», que es una de las dos
   * salidas que CB-09 autoriza; el alumno lo completa.
   */
  carga: number | null;
  repeticiones: number | null;
  origen: OrigenDePrecarga;
  /**
   * Antigüedad del dato, en días, cuando viene de una ejecución previa.
   *
   * Se informa siempre junto al valor por la consecuencia asumida en DD-15: un
   * valor de hace cuatro meses no se lee igual que el de la semana pasada, y
   * quien lo confirma tiene que poder notar la diferencia.
   */
  antiguedadEnDias: number | null;
}

function diasEntre(desde: Date, hasta: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.max(
    0,
    Math.floor((hasta.getTime() - desde.getTime()) / MS_POR_DIA),
  );
}

/** Una carga precargable: dentro de RN-55 y distinta de cero. */
function cargaUtilizable(carga: number | null): boolean {
  return carga !== null && carga > CARGA_MINIMA && carga <= CARGA_MAXIMA;
}

function repeticionesUtilizables(repeticiones: number | null): boolean {
  return (
    repeticiones !== null &&
    repeticiones >= REPETICIONES_MINIMAS &&
    repeticiones <= REPETICIONES_MAXIMAS
  );
}

/**
 * Valores con los que se presenta una serie (RF-030, CB-09).
 *
 * `ultimas` trae, a lo sumo, una ejecución por ejercicio: la más reciente.
 */
export function precargarSerie(
  serie: SeriePrescripta,
  ultimas: EjecucionPrevia[],
  hoy: Date,
): SeriePrecargada {
  const base = {
    position: serie.position,
    exerciseId: serie.exerciseId,
    repeticionesMinimas: serie.repeticionesMinimas,
    repeticionesMaximas: serie.repeticionesMaximas,
    warmup: serie.warmup,
  };

  const previa = ultimas.find(
    (ejecucion) => ejecucion.exerciseId === serie.exerciseId,
  );

  if (previa !== undefined && cargaUtilizable(previa.carga)) {
    return {
      ...base,
      carga: previa.carga,
      // Las repeticiones de la última ejecución sólo se proponen si son
      // utilizables; si no, el alumno trabaja contra el rango prescripto.
      repeticiones: repeticionesUtilizables(previa.repeticiones)
        ? previa.repeticiones
        : null,
      origen: 'ULTIMA_EJECUCION',
      antiguedadEnDias: diasEntre(previa.occurredOn, hoy),
    };
  }

  // Primera vez con el ejercicio, o la ejecución previa no dejó una carga
  // utilizable (una serie omitida, por ejemplo): el respaldo es la prescripción.
  if (cargaUtilizable(serie.cargaSugerida)) {
    return {
      ...base,
      carga: serie.cargaSugerida,
      repeticiones: null,
      origen: 'CARGA_SUGERIDA',
      antiguedadEnDias: null,
    };
  }

  // Ni historial ni carga sugerida. El campo queda vacío: CB-09 lo admite y
  // prohíbe expresamente resolverlo con un cero.
  return {
    ...base,
    carga: null,
    repeticiones: null,
    origen: 'SIN_DATOS',
    antiguedadEnDias: null,
  };
}

/** Precarga de todas las series congeladas de la sesión, en orden. */
export function precargarSeries(
  series: SeriePrescripta[],
  ultimas: EjecucionPrevia[],
  hoy: Date,
): SeriePrecargada[] {
  return [...series]
    .sort((a, b) => a.position - b.position)
    .map((serie) => precargarSerie(serie, ultimas, hoy));
}
