/**
 * Carga máxima estimada por ejercicio (RN-65, RN-66).
 *
 * Es la base del estancamiento: lo que RN-74 mide no es cuánto levantó el
 * alumno, sino si esa capacidad estimada creció en el período.
 */

/**
 * Tope de repeticiones sobre el que la estimación es fiable (RN-65).
 *
 * Por encima de 12 no se calcula: la fórmula extrapola cada vez peor cuanto más
 * lejos está de una repetición máxima real.
 */
export const TOPE_REPETICIONES_ESTIMACION = 12;

/** Serie de trabajo completada, reducida a lo que la estimación necesita. */
export interface SerieEstimable {
  warmup: boolean;
  completed: boolean;
  performedLoad: number | null;
  performedRepetitions: number | null;
}

/**
 * Carga máxima estimada de una serie, por la fórmula de Epley.
 *
 * `e1RM = peso × (1 + repeticiones / 30)`
 *
 * [SUPUESTO] El corpus nombra la carga máxima estimada en RN-65 y remite a una
 * fuente externa que no está en la documentación del proyecto. Se implementa
 * Epley por ser el estándar más difundido en entrenamiento de fuerza y por
 * degradarse de forma aceptable dentro del tope de 12 repeticiones que la propia
 * RN-65 fija. Pendiente de confirmar con un entrenador: la fórmula determina los
 * números sobre los que después se decide si hay estancamiento.
 *
 * Devuelve `null` cuando la serie no admite estimación (RN-65): calentamiento,
 * no completada, carga cero —un ejercicio de peso corporal no tiene carga que
 * estimar— o por encima del tope de repeticiones.
 */
export function cargaMaximaEstimadaDeSerie(
  serie: SerieEstimable,
): number | null {
  if (serie.warmup || !serie.completed) {
    return null;
  }

  const carga = serie.performedLoad;
  const repeticiones = serie.performedRepetitions;

  if (carga === null || carga <= 0) {
    return null;
  }
  if (
    repeticiones === null ||
    repeticiones < 1 ||
    repeticiones > TOPE_REPETICIONES_ESTIMACION
  ) {
    return null;
  }

  // Sin redondear: el valor se usa para comparar dos estimaciones entre sí
  // (RN-74), y redondear acá arrastra el error al cociente. Con el redondeo a
  // dos decimales, una progresión de 100 a 102,5 kg daba 2,49% en lugar de
  // 2,5% y caía del lado equivocado del umbral de estancamiento. Quien muestre
  // el valor lo redondea al presentarlo.
  return carga * (1 + repeticiones / 30);
}

/**
 * Carga máxima estimada de un conjunto de series: la mayor de las suyas (RN-66).
 *
 * `null` si ninguna serie admite estimación, que se distingue de un valor bajo:
 * no es que levantó poco, es que no hay con qué estimarlo (RN-73).
 */
export function cargaMaximaEstimada(
  series: readonly SerieEstimable[],
): number | null {
  const estimaciones = series
    .map(cargaMaximaEstimadaDeSerie)
    .filter((valor): valor is number => valor !== null);

  return estimaciones.length > 0 ? Math.max(...estimaciones) : null;
}
