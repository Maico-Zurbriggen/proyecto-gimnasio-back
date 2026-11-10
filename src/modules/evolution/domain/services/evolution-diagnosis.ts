import {
  cargaMaximaEstimada,
  type SerieEstimable,
} from '../../../indicators/domain/estimated-max-load';
import {
  SEMANAS_PERIODO_DIAGNOSTICO,
  UMBRALES_POR_DEFECTO,
  type DiagnosticThresholds,
} from './diagnostic-thresholds';

/**
 * Diagnóstico de evolución por ejercicio y del conjunto (HU32 - T1 y T2,
 * RN-79a).
 *
 * Las cinco situaciones se evalúan **en orden de precedencia**: la primera
 * condición que se cumple determina la situación y las restantes no se evalúan.
 * Ese orden no es cosmético. `DATOS_INSUFICIENTES` va primero porque sin datos
 * cualquier otra conclusión sería inventada, y `SOBREEXIGENCIA` va antes que
 * `PROGRESION_ADECUADA` porque un alumno puede estar subiendo la carga
 * justamente porque se está excediendo: tratar eso como progresión lo
 * empujaría a lesionarse.
 *
 * Dominio puro: no consulta la base ni el reloj.
 */

export type Situacion =
  | 'DATOS_INSUFICIENTES'
  | 'SOBREEXIGENCIA'
  | 'PROGRESION_ADECUADA'
  | 'ESTIMULO_INSUFICIENTE'
  | 'ESTANCAMIENTO';

/** Una serie registrada, con lo prescripto y lo ejecutado. */
export interface SerieDelDiagnostico extends SerieEstimable {
  /** Tope del rango prescripto: el objetivo de repeticiones (RN-69a). */
  prescribedMaxRepetitions: number;
  /** Esfuerzo percibido 1-10. `null` si el alumno no lo registró (RN-81). */
  perceivedEffort: number | null;
  /** Una serie agregada no cuenta para cumplimiento. */
  additional: boolean;
}

/** Una sesión del período, reducida a un ejercicio. */
export interface SesionDelDiagnostico {
  occurredOn: Date;
  series: SerieDelDiagnostico[];
}

/** Lo que el diagnóstico informa de cada ejercicio, para sustentarlo (RN-84). */
export interface MetricasDelEjercicio {
  sesionesConsideradas: number;
  variacionCargaMaxima: number | null;
  cumplimientoRepeticionesPorSesion: number[];
  esfuerzoMedioPorSesion: (number | null)[];
  /** RN-81: criterios que no se pudieron evaluar, para declararlos. */
  criteriosNoEvaluados: string[];
}

export interface DiagnosticoDeEjercicio {
  situacion: Situacion;
  metricas: MetricasDelEjercicio;
}

/** Series de trabajo prescriptas: ni calentamiento ni agregadas. */
function seriesDeTrabajo(
  series: readonly SerieDelDiagnostico[],
): SerieDelDiagnostico[] {
  return series.filter((serie) => !serie.warmup && !serie.additional);
}

/**
 * Cumplimiento de repeticiones de una sesión (RN-69a).
 *
 * `null` cuando la sesión no tiene series de trabajo prescriptas: no es 0%, es
 * que no hay nada que medir.
 */
export function cumplimientoDeSesion(
  sesion: SesionDelDiagnostico,
): number | null {
  const trabajo = seriesDeTrabajo(sesion.series);
  if (trabajo.length === 0) {
    return null;
  }

  const objetivo = trabajo.reduce(
    (total, serie) => total + serie.prescribedMaxRepetitions,
    0,
  );
  if (objetivo === 0) {
    return null;
  }

  const ejecutadas = trabajo.reduce(
    (total, serie) => total + (serie.performedRepetitions ?? 0),
    0,
  );
  return Math.min(100, Math.round((ejecutadas / objetivo) * 10000) / 100);
}

/**
 * Esfuerzo percibido medio de las series de trabajo de una sesión.
 *
 * `null` si el alumno no registró ninguno: es opcional, y su ausencia se
 * declara en lugar de suponerla (RN-81).
 */
export function esfuerzoMedioDeSesion(
  sesion: SesionDelDiagnostico,
): number | null {
  const registrados = seriesDeTrabajo(sesion.series)
    .map((serie) => serie.perceivedEffort)
    .filter((esfuerzo): esfuerzo is number => esfuerzo !== null);

  if (registrados.length === 0) {
    return null;
  }

  const suma = registrados.reduce((total, valor) => total + valor, 0);
  return Math.round((suma / registrados.length) * 100) / 100;
}

/**
 * Variación de la carga máxima estimada en el período (RN-74a).
 *
 * «Mejor de las últimas 3 semanas menos mejor de las primeras 3, sobre la mejor
 * de las primeras 3.» El corte es **temporal**, no por cantidad de sesiones:
 * partir por la mitad del conteo daría un resultado distinto para quien entrena
 * ocho veces la primera semana y dos la última, y lo que la regla compara es el
 * principio del período contra el final.
 *
 * `null` si falta alguno de los dos extremos: sin uno de ellos no hay variación
 * que calcular, que es distinto de una variación de cero.
 */
export function variacionDelPeriodo(
  sesiones: readonly SesionDelDiagnostico[],
  hasta: Date = new Date(),
  semanas: number = SEMANAS_PERIODO_DIAGNOSTICO,
): number | null {
  if (sesiones.length < 2) {
    return null;
  }

  const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;
  const inicio = new Date(hasta.getTime() - semanas * MS_POR_SEMANA);
  const corte = new Date(hasta.getTime() - (semanas / 2) * MS_POR_SEMANA);

  const estimarEntre = (desde: Date, hastaCorte: Date) =>
    cargaMaximaEstimada(
      sesiones
        .filter(
          (sesion) =>
            sesion.occurredOn.getTime() >= desde.getTime() &&
            sesion.occurredOn.getTime() < hastaCorte.getTime(),
        )
        .flatMap((sesion) => sesion.series),
    );

  const primeras = estimarEntre(inicio, corte);
  const ultimas = estimarEntre(corte, new Date(hasta.getTime() + 1));

  if (primeras === null || ultimas === null || primeras === 0) {
    return null;
  }

  return Math.round(((ultimas - primeras) / primeras) * 10000) / 100;
}

/** `true` si las últimas `n` sesiones consecutivas cumplen el predicado. */
function ultimasConsecutivas<T>(
  valores: readonly T[],
  n: number,
  cumple: (valor: T) => boolean,
): boolean {
  if (valores.length < n) {
    return false;
  }
  return valores.slice(-n).every(cumple);
}

/**
 * Situación de un ejercicio en el período (RN-79a).
 *
 * `sesiones` son las del período que incluyen ese ejercicio, ya filtradas.
 */
export function diagnosticarEjercicio(
  sesiones: readonly SesionDelDiagnostico[],
  hasta: Date = new Date(),
  umbrales: DiagnosticThresholds = UMBRALES_POR_DEFECTO,
): DiagnosticoDeEjercicio {
  const ordenadas = [...sesiones].sort(
    (a, b) => a.occurredOn.getTime() - b.occurredOn.getTime(),
  );

  const cumplimientos = ordenadas.map((sesion) => cumplimientoDeSesion(sesion));
  const esfuerzos = ordenadas.map((sesion) => esfuerzoMedioDeSesion(sesion));
  const variacion = variacionDelPeriodo(ordenadas, hasta);

  const criteriosNoEvaluados: string[] = [];
  if (esfuerzos.every((esfuerzo) => esfuerzo === null)) {
    // RN-81: el diagnóstico se produce igual, declarando qué no pudo mirar.
    criteriosNoEvaluados.push('esfuerzo_percibido_no_registrado');
  }

  const metricas: MetricasDelEjercicio = {
    sesionesConsideradas: ordenadas.length,
    variacionCargaMaxima: variacion,
    cumplimientoRepeticionesPorSesion: cumplimientos.map((valor) => valor ?? 0),
    esfuerzoMedioPorSesion: esfuerzos,
    criteriosNoEvaluados,
  };

  // 1 · Sin datos no se concluye nada.
  if (ordenadas.length < umbrales.sesionesMinimas || variacion === null) {
    if (variacion === null) {
      criteriosNoEvaluados.push('variacion_carga_maxima_no_calculable');
    }
    return { situacion: 'DATOS_INSUFICIENTES', metricas };
  }

  // 2 · Sobreexigencia antes que progresión: subir la carga excediéndose no es
  //     progresar, y confundirlos empuja al alumno a lesionarse.
  const porCumplimiento = ultimasConsecutivas(
    cumplimientos,
    umbrales.sesionesConsecutivasSobreexigencia,
    (valor) => valor !== null && valor < umbrales.cumplimientoBajo,
  );
  const porEsfuerzo = ultimasConsecutivas(
    esfuerzos,
    umbrales.sesionesConsecutivasSobreexigencia,
    (valor) => valor !== null && valor >= umbrales.esfuerzoAlto,
  );
  if (porCumplimiento || porEsfuerzo) {
    return { situacion: 'SOBREEXIGENCIA', metricas };
  }

  // 3 · Progresión adecuada.
  if (variacion >= umbrales.variacionProgresion) {
    return { situacion: 'PROGRESION_ADECUADA', metricas };
  }

  // 4 · Estímulo insuficiente: cumple todo el rango sin esfuerzo y no sube la
  //     carga. Es la contraparte simétrica de la sobreexigencia, y sin ella
  //     este caso caía en ESTANCAMIENTO y recibía el ajuste equivocado.
  const recientes = ordenadas.slice(-umbrales.sesionesEstimuloInsuficiente);
  const alcanzoElTope =
    recientes.length === umbrales.sesionesEstimuloInsuficiente &&
    recientes.every((sesion) => {
      const trabajo = seriesDeTrabajo(sesion.series);
      return (
        trabajo.length > 0 &&
        trabajo.every(
          (serie) =>
            (serie.performedRepetitions ?? 0) >= serie.prescribedMaxRepetitions,
        )
      );
    });
  const esfuerzosRecientes = esfuerzos.slice(
    -umbrales.sesionesEstimuloInsuficiente,
  );
  // «si está registrado»: su ausencia no descarta la situación (RN-81).
  const sinSobreesfuerzo = esfuerzosRecientes.every(
    (valor) => valor === null || valor <= umbrales.esfuerzoBajo,
  );
  if (alcanzoElTope && sinSobreesfuerzo) {
    return { situacion: 'ESTIMULO_INSUFICIENTE', metricas };
  }

  // 5 · Ninguna de las anteriores.
  return { situacion: 'ESTANCAMIENTO', metricas };
}

/** Lo que la situación global necesita saber del conjunto. */
export interface EntradaGlobal {
  situaciones: readonly Situacion[];
  /** Ejercicios de la rutina vigente, aunque no tengan sesiones. */
  totalEjercicios: number;
  /** Adherencia del período; `null` si no está disponible (RN-68). */
  adherencia: number | null;
  /** Cumplimiento de repeticiones medio del período; `null` si no hay datos. */
  cumplimientoMedio: number | null;
}

/**
 * Situación global del alumno (RN-79a).
 *
 * Se evalúa sobre los ejercicios con situación **distinta** de
 * `DATOS_INSUFICIENTES`: los no evaluables no votan, pero sí cuentan para
 * decidir si hay información suficiente para concluir algo.
 */
export function diagnosticarGlobal(
  entrada: EntradaGlobal,
  umbrales: DiagnosticThresholds = UMBRALES_POR_DEFECTO,
): Situacion {
  const calculables = entrada.situaciones.filter(
    (situacion) => situacion !== 'DATOS_INSUFICIENTES',
  );

  // 1 · Sin adherencia o sin la mitad de los ejercicios evaluables, no se
  //     concluye. Un diagnóstico sobre dos ejercicios de diez no describe la
  //     rutina, describe dos ejercicios.
  if (
    entrada.adherencia === null ||
    entrada.totalEjercicios === 0 ||
    calculables.length * 2 < entrada.totalEjercicios
  ) {
    return 'DATOS_INSUFICIENTES';
  }

  const proporcion = (situacion: Situacion) =>
    calculables.filter((actual) => actual === situacion).length /
    calculables.length;

  // 2 · Sobreexigencia.
  const adherenciaBajaConBajoCumplimiento =
    entrada.adherencia < umbrales.adherenciaBaja &&
    entrada.cumplimientoMedio !== null &&
    entrada.cumplimientoMedio < umbrales.cumplimientoBajo;
  if (
    proporcion('SOBREEXIGENCIA') >= umbrales.proporcionSobreexigenciaGlobal ||
    adherenciaBajaConBajoCumplimiento
  ) {
    return 'SOBREEXIGENCIA';
  }

  // 3 · Estancamiento.
  if (proporcion('ESTANCAMIENTO') >= umbrales.proporcionMayoriaGlobal) {
    return 'ESTANCAMIENTO';
  }

  // 4 · Estímulo insuficiente.
  if (proporcion('ESTIMULO_INSUFICIENTE') >= umbrales.proporcionMayoriaGlobal) {
    return 'ESTIMULO_INSUFICIENTE';
  }

  // 5 · Ninguna de las anteriores.
  return 'PROGRESION_ADECUADA';
}
