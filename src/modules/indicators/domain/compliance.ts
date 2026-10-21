/**
 * Cumplimiento de series y de repeticiones (HU23 - T2, RN-69 y RN-69a).
 *
 * Mide **qué hizo cuando vino**, a diferencia de la adherencia, que mide si vino.
 * Son dos indicadores distintos y nunca se comparan entre sí: el glosario
 * prohíbe hablar de «cumplimiento» sin calificar cuál (D2/§2).
 */

/** Registro de una serie dentro de una sesión, con lo prescripto y lo ejecutado. */
export interface RegistroDeSerie {
  /** Una serie de calentamiento no cuenta para ningún indicador (RN-54). */
  warmup: boolean;
  /** Series agregadas durante la sesión: cuentan para volumen, no para cumplimiento. */
  additional: boolean;
  completed: boolean;
  prescribedMaxRepetitions: number;
  performedRepetitions: number | null;
}

/** Resultado de un cumplimiento, que puede no ser calculable. */
export type Cumplimiento =
  | {
      disponible: true;
      porcentaje: number;
      numerador: number;
      denominador: number;
    }
  | { disponible: false; motivo: 'SIN_SERIES_DE_TRABAJO' };

/**
 * Series de trabajo prescriptas: ni calentamiento ni agregadas sobre la marcha.
 *
 * Las adicionales se excluyen a propósito: no estaban prescriptas, así que
 * sumarlas al denominador castigaría a quien hace de más, y sumarlas sólo al
 * numerador permitiría superar el 100% sin haber cumplido lo pedido.
 */
function seriesDeTrabajoPrescriptas(
  registros: readonly RegistroDeSerie[],
): RegistroDeSerie[] {
  return registros.filter((r) => !r.warmup && !r.additional);
}

/**
 * Cumplimiento de series (RN-69): completadas sobre prescriptas.
 *
 * Una serie sustituida cuenta como cumplida, marcada como sustituida (RN-56,
 * DD-19): si sustituir castigara la métrica, el alumno dejaría de declararlo y
 * el registro —del que depende toda la inteligencia— se degradaría.
 */
export function cumplimientoDeSeries(
  registros: readonly RegistroDeSerie[],
): Cumplimiento {
  const deTrabajo = seriesDeTrabajoPrescriptas(registros);

  if (deTrabajo.length === 0) {
    return { disponible: false, motivo: 'SIN_SERIES_DE_TRABAJO' };
  }

  const completadas = deTrabajo.filter((r) => r.completed).length;

  return {
    disponible: true,
    porcentaje: Math.round((completadas / deTrabajo.length) * 10000) / 100,
    numerador: completadas,
    denominador: deTrabajo.length,
  };
}

/**
 * Cumplimiento de repeticiones (RN-69a): ejecutadas sobre objetivo.
 *
 * El objetivo es el **tope** del rango prescripto. Es una convención del
 * proyecto marcada `[S]`: con un rango de 8 a 12, cumplir el 100% significa
 * haber hecho 12, no 8. Se acota al 100% para que hacer de más no compense
 * series omitidas.
 *
 * Una serie no completada aporta sus repeticiones reales —cero si no se
 * registraron—, no se descarta: omitirla del denominador escondería el
 * incumplimiento, que es justo lo que el indicador tiene que mostrar.
 */
export function cumplimientoDeRepeticiones(
  registros: readonly RegistroDeSerie[],
): Cumplimiento {
  const deTrabajo = seriesDeTrabajoPrescriptas(registros);

  if (deTrabajo.length === 0) {
    return { disponible: false, motivo: 'SIN_SERIES_DE_TRABAJO' };
  }

  const objetivo = deTrabajo.reduce(
    (total, r) => total + r.prescribedMaxRepetitions,
    0,
  );

  if (objetivo === 0) {
    return { disponible: false, motivo: 'SIN_SERIES_DE_TRABAJO' };
  }

  const ejecutadas = deTrabajo.reduce(
    (total, r) => total + (r.performedRepetitions ?? 0),
    0,
  );

  const porcentaje = Math.min(100, (ejecutadas / objetivo) * 100);

  return {
    disponible: true,
    porcentaje: Math.round(porcentaje * 100) / 100,
    numerador: ejecutadas,
    denominador: objetivo,
  };
}
