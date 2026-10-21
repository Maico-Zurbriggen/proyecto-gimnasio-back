/**
 * Adherencia sobre la ventana móvil de cuatro semanas (HU23 - T1, RN-67 y RN-68).
 *
 * Mide **si vino**: sesiones completadas sobre sesiones esperadas. Funciones
 * puras sobre datos ya leídos; no consultan la base ni el reloj del sistema.
 */

/** Semanas que abarca la ventana móvil de adherencia (RN-67). */
export const SEMANAS_VENTANA_ADHERENCIA = 4;

/** Semanas con rutina vigente que hacen falta para empezar a calcular (RN-68). */
export const SEMANAS_MINIMAS_PARA_CALCULAR = 2;

const MS_POR_DIA = 24 * 60 * 60 * 1000;
const MS_POR_SEMANA = 7 * MS_POR_DIA;

/** Sesión ya ejecutada, reducida a lo que la adherencia necesita. */
export interface SesionDeAdherencia {
  /** Fecha de ocurrencia, no de registro (RN-72). */
  occurredOn: Date;
  /** Sólo las COMPLETADA cuentan; EN_CURSO y ABANDONADA no (D6/§4). */
  completada: boolean;
}

/**
 * Frecuencia semanal objetivo vigente durante un período.
 *
 * Una rutina declara cuántas sesiones espera por semana. Cuando el alumno cambia
 * de rutina dentro de la ventana, conviven dos frecuencias distintas, y cada
 * semana debe computarse con la suya.
 */
export interface FrecuenciaVigente {
  desde: Date;
  /** `null` mientras siga vigente. */
  hasta: Date | null;
  sesionesPorSemana: number;
}

/** Resultado del cálculo de adherencia. */
export type Adherencia =
  | {
      disponible: true;
      /** Porcentaje entre 0 y 100. */
      porcentaje: number;
      sesionesCompletadas: number;
      sesionesEsperadas: number;
    }
  | {
      disponible: false;
      /** Por qué no se puede calcular, para declararlo en lugar de mostrar 0. */
      motivo: 'SIN_HISTORIAL_SUFICIENTE' | 'SIN_FRECUENCIA_OBJETIVO';
    };

function inicioDeVentana(hasta: Date, semanas: number): Date {
  return new Date(hasta.getTime() - semanas * MS_POR_SEMANA);
}

function dentroDe(fecha: Date, desde: Date, hasta: Date): boolean {
  return (
    fecha.getTime() >= desde.getTime() && fecha.getTime() < hasta.getTime()
  );
}

/** Frecuencia vigente en un instante dado, o `null` si no había ninguna. */
function frecuenciaEn(
  frecuencias: readonly FrecuenciaVigente[],
  instante: Date,
): number | null {
  const vigente = frecuencias.find(
    (f) =>
      f.desde.getTime() <= instante.getTime() &&
      (f.hasta === null || f.hasta.getTime() > instante.getTime()),
  );
  return vigente?.sesionesPorSemana ?? null;
}

/**
 * Sesiones esperadas en la ventana, sumadas **semana a semana**.
 *
 * Es la corrección que introduce RN-67: tomar la frecuencia de hoy y
 * multiplicarla por cuatro daría un denominador falso si el alumno cambió de
 * rutina dentro de la ventana. Cada semana aporta la frecuencia que regía en
 * ella.
 */
export function sesionesEsperadasEnVentana(
  frecuencias: readonly FrecuenciaVigente[],
  hasta: Date,
  semanas: number = SEMANAS_VENTANA_ADHERENCIA,
): number {
  let total = 0;

  for (let i = 0; i < semanas; i += 1) {
    const inicioSemana = new Date(hasta.getTime() - (i + 1) * MS_POR_SEMANA);
    total += frecuenciaEn(frecuencias, inicioSemana) ?? 0;
  }

  return total;
}

/**
 * Semanas completas con alguna frecuencia vigente, hasta el instante dado.
 *
 * RN-68: la adherencia se calcula desde que el alumno acumula dos semanas con
 * alguna rutina vigente, y **cambiar de rutina no reinicia el conteo**: lo que
 * importa es el tiempo acumulado bajo cualquier rutina, no bajo la actual.
 */
export function semanasConRutinaVigente(
  frecuencias: readonly FrecuenciaVigente[],
  hasta: Date,
): number {
  if (frecuencias.length === 0) {
    return 0;
  }

  const primera = frecuencias.reduce((min, f) =>
    f.desde.getTime() < min.desde.getTime() ? f : min,
  );

  const transcurrido = hasta.getTime() - primera.desde.getTime();
  return Math.max(0, Math.floor(transcurrido / MS_POR_SEMANA));
}

/**
 * Adherencia del alumno sobre la ventana móvil (RN-67, RN-68).
 *
 * Se acota al 100%: ocho sesiones en una semana que esperaba cuatro no premian
 * el exceso (D10/CB-52). Y cuando no hay datos suficientes **se declara**, en
 * lugar de devolver cero (RN-73).
 */
export function calcularAdherencia(
  sesiones: readonly SesionDeAdherencia[],
  frecuencias: readonly FrecuenciaVigente[],
  hasta: Date,
  semanas: number = SEMANAS_VENTANA_ADHERENCIA,
): Adherencia {
  if (
    semanasConRutinaVigente(frecuencias, hasta) < SEMANAS_MINIMAS_PARA_CALCULAR
  ) {
    return { disponible: false, motivo: 'SIN_HISTORIAL_SUFICIENTE' };
  }

  const esperadas = sesionesEsperadasEnVentana(frecuencias, hasta, semanas);
  if (esperadas === 0) {
    return { disponible: false, motivo: 'SIN_FRECUENCIA_OBJETIVO' };
  }

  const desde = inicioDeVentana(hasta, semanas);
  const completadas = sesiones.filter(
    (s) => s.completada && dentroDe(s.occurredOn, desde, hasta),
  ).length;

  const porcentaje = Math.min(100, (completadas / esperadas) * 100);

  return {
    disponible: true,
    porcentaje: Math.round(porcentaje * 100) / 100,
    sesionesCompletadas: completadas,
    sesionesEsperadas: esperadas,
  };
}
