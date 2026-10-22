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

/** Zona horaria con la que se recortan las semanas si no se indica otra. */
export const ZONA_HORARIA_POR_DEFECTO = 'America/Argentina/Buenos_Aires';

/**
 * Fecha civil de un instante en una zona horaria, como medianoche UTC.
 *
 * Trabajar con la fecha civil y no con el instante es lo que permite que una
 * sesión de las 22:00 del domingo caiga en la semana del domingo y no en la del
 * lunes siguiente, que es lo que pasaría comparando instantes UTC.
 */
export function fechaLocal(instante: Date, zona: string): Date {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instante);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((candidata) => candidata.type === tipo)?.value);

  return new Date(Date.UTC(parte('year'), parte('month') - 1, parte('day')));
}

/**
 * Comienzo del lunes de la semana que contiene a la fecha dada (RN-110).
 *
 * Las semanas van de lunes a domingo en la zona horaria del gimnasio. En
 * JavaScript el domingo es 0, así que se lo trata como séptimo día.
 */
export function inicioDeSemana(fecha: Date): Date {
  const dia = fecha.getUTCDay();
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1;
  return new Date(fecha.getTime() - diasDesdeLunes * MS_POR_DIA);
}

/**
 * Fin de la última semana **completa** anterior al instante dado (RN-110).
 *
 * La ventana móvil cuenta semanas completas, así que la semana en curso no
 * entra: incluirla mediría un alumno a mitad de semana contra una frecuencia
 * objetivo entera y lo mostraría peor de lo que está.
 */
export function finDeUltimaSemanaCompleta(hasta: Date, zona: string): Date {
  return inicioDeSemana(fechaLocal(hasta, zona));
}

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
  zona: string = ZONA_HORARIA_POR_DEFECTO,
): Adherencia {
  if (
    semanasConRutinaVigente(frecuencias, hasta) < SEMANAS_MINIMAS_PARA_CALCULAR
  ) {
    return { disponible: false, motivo: 'SIN_HISTORIAL_SUFICIENTE' };
  }

  // La ventana termina el domingo de la última semana completa, no «ahora»
  // (RN-110): así las cuatro semanas son semanas calendario del gimnasio y no
  // bloques de siete días que empiezan un miércoles cualquiera.
  const corte = finDeUltimaSemanaCompleta(hasta, zona);

  const esperadas = sesionesEsperadasEnVentana(frecuencias, corte, semanas);
  if (esperadas === 0) {
    return { disponible: false, motivo: 'SIN_FRECUENCIA_OBJETIVO' };
  }

  const desde = inicioDeVentana(corte, semanas);
  const completadas = sesiones.filter(
    (s) =>
      s.completada && dentroDe(fechaLocal(s.occurredOn, zona), desde, corte),
  ).length;

  const porcentaje = Math.min(100, (completadas / esperadas) * 100);

  return {
    disponible: true,
    porcentaje: Math.round(porcentaje * 100) / 100,
    sesionesCompletadas: completadas,
    sesionesEsperadas: esperadas,
  };
}
