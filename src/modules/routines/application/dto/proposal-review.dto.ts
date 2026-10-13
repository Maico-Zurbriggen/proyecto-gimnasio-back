import type { EvaluacionDatosRenovacion } from '../../domain/services/cycle-renewal-data';

/**
 * Advertencia de datos desactualizados en el payload de revisión (HU04 - T1).
 *
 * El entrenador tiene que poder ver **antes de decidir** si la propuesta se generó
 * sin medición nueva, y cuántos ciclos seguidos lleva el alumno sin cargar datos.
 * Mostrarla es HU04 - T2, que es frontend.
 */
export interface AdvertenciaDatosDesactualizadosDto {
  /** `true` cuando la propuesta se generó sin medición nueva en el ciclo. */
  sinDatosActualizados: boolean;
  /** Qué dato faltó, para declararlo explícitamente (HU03, Esc. 2). */
  datoFaltante?: string;
  /** Faltas consecutivas del alumno, incluida la de esta propuesta. */
  faltasConsecutivas: number;
  /** `true` cuando el alumno alcanzó el tope que habilita el bloqueo (HU03 - T5). */
  alcanzoTopeDeFaltas: boolean;
}

/**
 * Construye la advertencia a partir de la evaluación del ciclo.
 *
 * Las renovaciones automáticas usan la evaluación inmutable persistida en el
 * ciclo. Propuestas históricas sin esa instantánea conservan su derivación
 * limitada a las mediciones fechadas antes de su creación.
 */
export function construirAdvertenciaDatos(
  evaluacion: EvaluacionDatosRenovacion,
): AdvertenciaDatosDesactualizadosDto {
  return {
    sinDatosActualizados: evaluacion.sinDatosActualizados,
    datoFaltante: evaluacion.datoFaltante,
    faltasConsecutivas: evaluacion.faltasConsecutivas,
    alcanzoTopeDeFaltas: evaluacion.alcanzoTopeDeFaltas,
  };
}
