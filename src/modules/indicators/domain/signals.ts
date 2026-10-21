import {
  calcularAdherencia,
  type FrecuenciaVigente,
  type SesionDeAdherencia,
} from './adherence';
import { cargaMaximaEstimada, type SerieEstimable } from './estimated-max-load';
import { volumenPorGrupo, type SerieConMusculos } from './volume';

/**
 * Señales de seguimiento (HU26 - T1, RN-74 a RN-77).
 *
 * Señalan qué alumnos requieren atención. La regla que las atraviesa es RN-77:
 * ninguna señal se emite sin el mínimo de datos que su regla exige, y la
 * ausencia por falta de datos **se distingue** de la ausencia por normalidad.
 *
 * Todos los umbrales son convenciones del proyecto marcadas `[S]` en D12/§1.1:
 * discutibles con un entrenador, no datos del dominio verificados.
 */

/** Semanas del período de diagnóstico (D2/§3). */
export const SEMANAS_PERIODO_DIAGNOSTICO = 6;

/** Variación mínima de carga máxima estimada para no estar estancado (RN-74). */
export const UMBRAL_VARIACION_ESTANCAMIENTO = 2.5;

/** Sesiones mínimas con el ejercicio para poder diagnosticarlo (RN-74). */
export const SESIONES_MINIMAS_ESTANCAMIENTO = 4;

/** Puntos porcentuales de caída que constituyen una señal (RN-75). */
export const UMBRAL_CAIDA_ADHERENCIA = 25;

/** Series efectivas semanales por debajo de las cuales hay desbalance (RN-76). */
export const VOLUMEN_SEMANAL_MINIMO = 6;

/** Series efectivas semanales por encima de las cuales hay desbalance (RN-76). */
export const VOLUMEN_SEMANAL_MAXIMO = 22;

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Sesión del período, con sus series ya clasificadas. */
export interface SesionDelPeriodo {
  occurredOn: Date;
  completada: boolean;
  series: readonly (SerieEstimable &
    SerieConMusculos & { exerciseId: string })[];
}

/**
 * Resultado de una señal: detectada, ausente, o no evaluable por falta de datos.
 *
 * `sobre` identifica el sujeto de la señal —el ejercicio, cuando la regla se
 * evalúa por ejercicio— y va en los tres estados, no sólo en `DETECTADA`: una
 * lista de señales sin atribuir no se puede leer, porque `DATOS_INSUFICIENTES`
 * es indistinguible entre un ejercicio y otro.
 */
export type Senal<T> = { sobre?: string } & (
  | { estado: 'DETECTADA'; detalle: T }
  | { estado: 'SIN_SENAL' }
  | { estado: 'DATOS_INSUFICIENTES'; falta: string }
);

/**
 * Variación de la carga máxima estimada en el período (RN-74a).
 *
 * `(mejor de las últimas 3 semanas − mejor de las primeras 3) / mejor de las
 * primeras 3`. Si falta alguno de los dos extremos, **la variación no es
 * calculable** — no vale asumir cero.
 */
export function variacionDeCargaMaxima(
  sesiones: readonly SesionDelPeriodo[],
  exerciseId: string,
  hasta: Date,
  semanas: number = SEMANAS_PERIODO_DIAGNOSTICO,
): number | null {
  const inicioPeriodo = new Date(hasta.getTime() - semanas * MS_POR_SEMANA);
  const mitad = new Date(hasta.getTime() - (semanas / 2) * MS_POR_SEMANA);

  const seriesDe = (desde: Date, hastaCorte: Date): SerieEstimable[] =>
    sesiones
      .filter(
        (s) =>
          s.completada &&
          s.occurredOn.getTime() >= desde.getTime() &&
          s.occurredOn.getTime() < hastaCorte.getTime(),
      )
      .flatMap((s) =>
        s.series.filter((serie) => serie.exerciseId === exerciseId),
      );

  const primeras = cargaMaximaEstimada(seriesDe(inicioPeriodo, mitad));
  const ultimas = cargaMaximaEstimada(seriesDe(mitad, hasta));

  if (primeras === null || ultimas === null || primeras === 0) {
    return null;
  }

  return Math.round(((ultimas - primeras) / primeras) * 10000) / 100;
}

export interface EstancamientoDetalle {
  exerciseId: string;
  variacionPorcentual: number;
  sesionesConsideradas: number;
}

/**
 * Estancamiento en un ejercicio (RN-74).
 *
 * La variación de la carga máxima estimada es menor que +2,5% en el período,
 * con al menos 4 sesiones que incluyan ese ejercicio. Sin ese mínimo no se
 * emite señal: es `DATOS_INSUFICIENTES`, no «sin estancamiento».
 */
export function detectarEstancamiento(
  sesiones: readonly SesionDelPeriodo[],
  exerciseId: string,
  hasta: Date,
): Senal<EstancamientoDetalle> {
  const conElEjercicio = sesiones.filter(
    (s) =>
      s.completada && s.series.some((serie) => serie.exerciseId === exerciseId),
  );

  if (conElEjercicio.length < SESIONES_MINIMAS_ESTANCAMIENTO) {
    return {
      sobre: exerciseId,
      estado: 'DATOS_INSUFICIENTES',
      falta: `hacen falta ${String(SESIONES_MINIMAS_ESTANCAMIENTO)} sesiones con el ejercicio y hay ${String(conElEjercicio.length)}`,
    };
  }

  const variacion = variacionDeCargaMaxima(sesiones, exerciseId, hasta);

  if (variacion === null) {
    return {
      sobre: exerciseId,
      estado: 'DATOS_INSUFICIENTES',
      falta: 'la variación de carga máxima estimada no es calculable',
    };
  }

  if (variacion >= UMBRAL_VARIACION_ESTANCAMIENTO) {
    return { sobre: exerciseId, estado: 'SIN_SENAL' };
  }

  return {
    sobre: exerciseId,
    estado: 'DETECTADA',
    detalle: {
      exerciseId,
      variacionPorcentual: variacion,
      sesionesConsideradas: conElEjercicio.length,
    },
  };
}

export interface CaidaAdherenciaDetalle {
  adherenciaReciente: number;
  adherenciaPrevia: number;
  caidaEnPuntos: number;
}

/**
 * Caída de adherencia (RN-75).
 *
 * La adherencia de las últimas 2 semanas es al menos 25 puntos porcentuales
 * menor que la de las 2 semanas previas. Si alguno de los dos tramos no es
 * calculable, no hay señal que emitir.
 *
 * `SIN_SENAL` significa «no hay caída», no «el alumno está entrenando»: un
 * alumno con 0% en los dos tramos no cae —ya estaba en cero— y esta regla no lo
 * marca. Por eso el motivo acompaña al estado: quien lea la señal necesita
 * poder distinguir una adherencia sostenida de un cero sostenido, que es una
 * situación peor y que detecta la adherencia de HU23, no RN-75.
 */
export function detectarCaidaDeAdherencia(
  sesiones: readonly SesionDeAdherencia[],
  frecuencias: readonly FrecuenciaVigente[],
  hasta: Date,
): Senal<CaidaAdherenciaDetalle> {
  const reciente = calcularAdherencia(sesiones, frecuencias, hasta, 2);
  const previa = calcularAdherencia(
    sesiones,
    frecuencias,
    new Date(hasta.getTime() - 2 * MS_POR_SEMANA),
    2,
  );

  if (!reciente.disponible || !previa.disponible) {
    return {
      estado: 'DATOS_INSUFICIENTES',
      falta: 'no hay adherencia calculable en los dos tramos de dos semanas',
    };
  }

  const caida =
    Math.round((previa.porcentaje - reciente.porcentaje) * 100) / 100;

  if (caida < UMBRAL_CAIDA_ADHERENCIA) {
    return {
      estado: 'SIN_SENAL',
      sobre:
        reciente.porcentaje === 0 && previa.porcentaje === 0
          ? 'adherencia nula sostenida en los dos tramos: no hay caída que medir'
          : `adherencia ${String(previa.porcentaje)}% -> ${String(reciente.porcentaje)}%`,
    };
  }

  return {
    estado: 'DETECTADA',
    detalle: {
      adherenciaReciente: reciente.porcentaje,
      adherenciaPrevia: previa.porcentaje,
      caidaEnPuntos: caida,
    },
  };
}

export interface DesbalanceDetalle {
  grupo: string;
  seriesSemanales: number;
  tipo: 'POR_DEFECTO' | 'POR_EXCESO';
}

/**
 * Desbalance de volumen (RN-76).
 *
 * Un grupo muscular recibe menos de 6 o más de 22 series efectivas semanales,
 * promediadas sobre 4 semanas.
 *
 * Los rangos son orientativos de literatura de entrenamiento, **no una
 * recomendación de salud**. Un grupo sin ninguna serie no se informa como
 * desbalance por defecto: puede ser que el ejercicio esté sin clasificar
 * (RN-30), y confundir «no estimulado» con «sin datos» produciría señales
 * falsas.
 */
export function detectarDesbalance(
  sesiones: readonly SesionDelPeriodo[],
  hasta: Date,
  semanas = 4,
): Senal<DesbalanceDetalle[]> {
  const desde = new Date(hasta.getTime() - semanas * MS_POR_SEMANA);

  const delPeriodo = sesiones.filter(
    (s) =>
      s.completada &&
      s.occurredOn.getTime() >= desde.getTime() &&
      s.occurredOn.getTime() < hasta.getTime(),
  );

  if (delPeriodo.length === 0) {
    return {
      estado: 'DATOS_INSUFICIENTES',
      falta: 'no hay sesiones completadas en las últimas cuatro semanas',
    };
  }

  const volumen = volumenPorGrupo(delPeriodo.flatMap((s) => s.series));

  if (volumen.size === 0) {
    return {
      estado: 'DATOS_INSUFICIENTES',
      falta: 'ningún ejercicio ejecutado tiene clasificación muscular',
    };
  }

  const desbalances: DesbalanceDetalle[] = [];

  for (const [grupo, total] of volumen) {
    const semanal = Math.round((total / semanas) * 10) / 10;

    if (semanal < VOLUMEN_SEMANAL_MINIMO) {
      desbalances.push({
        grupo,
        seriesSemanales: semanal,
        tipo: 'POR_DEFECTO',
      });
    } else if (semanal > VOLUMEN_SEMANAL_MAXIMO) {
      desbalances.push({ grupo, seriesSemanales: semanal, tipo: 'POR_EXCESO' });
    }
  }

  return desbalances.length > 0
    ? { estado: 'DETECTADA', detalle: desbalances }
    : { estado: 'SIN_SENAL' };
}
