/**
 * Umbrales del diagnóstico de evolución (HU32 - T1, PD-09).
 *
 * Todos los valores de RN-79a están marcados `[S]` en D12/§1.1: son
 * convenciones del equipo sin fundamento externo, y determinan literalmente qué
 * le va a proponer el sistema a una persona. PD-09 los tiene pendientes de
 * validar con un entrenador.
 *
 * Por eso se declaran acá y se inyectan, en lugar de quedar escritos dentro del
 * cálculo: cuando el cliente los corrija, se cambia un objeto y no se sale a
 * buscar números sueltos por el código. Los valores por defecto son los del
 * corpus.
 */

export interface DiagnosticThresholds {
  /** Sesiones con el ejercicio para que el período sea evaluable (situación 1). */
  sesionesMinimas: number;
  /** Cumplimiento de repeticiones por debajo del cual hay sobreexigencia (situación 2). */
  cumplimientoBajo: number;
  /** Sesiones consecutivas que deben cumplir el criterio de sobreexigencia. */
  sesionesConsecutivasSobreexigencia: number;
  /** Esfuerzo percibido medio a partir del cual hay sobreexigencia (situación 2). */
  esfuerzoAlto: number;
  /** Variación de carga máxima estimada que cuenta como progresión (situación 3). */
  variacionProgresion: number;
  /** Sesiones recientes que se miran para el estímulo insuficiente (situación 4). */
  sesionesEstimuloInsuficiente: number;
  /** Esfuerzo percibido medio por debajo del cual el estímulo es insuficiente. */
  esfuerzoBajo: number;
  /** Proporción de ejercicios en sobreexigencia que arrastra a la situación global. */
  proporcionSobreexigenciaGlobal: number;
  /** Proporción de ejercicios en estancamiento o estímulo insuficiente (global). */
  proporcionMayoriaGlobal: number;
  /** Adherencia por debajo de la cual, con bajo cumplimiento, hay sobreexigencia global. */
  adherenciaBaja: number;
}

/** Valores de RN-79a. `[S]` convenciones del proyecto, no datos verificados. */
export const UMBRALES_POR_DEFECTO: DiagnosticThresholds = {
  sesionesMinimas: 4,
  cumplimientoBajo: 70,
  sesionesConsecutivasSobreexigencia: 3,
  esfuerzoAlto: 9,
  variacionProgresion: 2.5,
  sesionesEstimuloInsuficiente: 2,
  esfuerzoBajo: 5,
  proporcionSobreexigenciaGlobal: 1 / 3,
  proporcionMayoriaGlobal: 1 / 2,
  adherenciaBaja: 50,
};

/** Semanas del período de diagnóstico (D2/§3). */
export const SEMANAS_PERIODO_DIAGNOSTICO = 6;

/** Periodicidad del diagnóstico (RN-78). `[S]`. */
export const SEMANAS_ENTRE_DIAGNOSTICOS = 2;
