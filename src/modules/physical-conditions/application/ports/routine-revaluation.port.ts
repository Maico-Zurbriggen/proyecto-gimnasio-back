/**
 * Reevaluación de la rutina vigente ante un cambio de condiciones (RN-91,
 * FL-12, criterio 21).
 *
 * Declarar o cerrar una condición cambia qué ejercicios están contraindicados,
 * y la rutina vigente tiene que reflejarlo sin esperar a la próxima
 * renovación: el alumno entrena con lo que la pantalla le muestra hoy.
 *
 * Es un puerto y no una llamada directa para que el módulo de condiciones no
 * dependa del de prescripciones. Además deja declarado el límite de RN-92: la
 * reevaluación **marca** los ejercicios afectados, no los retira de la rutina.
 */
export interface RoutineRevaluation {
  /**
   * Reevalúa la rutina vigente del alumno y devuelve qué cambió.
   *
   * No lanza si el alumno no tiene rutina vigente: no tener rutina no es un
   * error al declarar una condición.
   */
  revaluateForStudent(studentId: string): Promise<RevaluationOutcome>;
}

export interface RevaluationOutcome {
  /** Ejercicios que pasaron a ADVERTIDO (RN-44b: se señalan, no impiden). */
  advertidos: number;
  /** Ejercicios que pasaron a INCOMPATIBLE. */
  incompatibles: number;
  /** Ejercicios que volvieron a COMPATIBLE porque su condición se cerró. */
  restaurados: number;
}

/** Resultado vacío: no hubo rutina vigente, o nada cambió. */
export const SIN_CAMBIOS: RevaluationOutcome = {
  advertidos: 0,
  incompatibles: 0,
  restaurados: 0,
};
