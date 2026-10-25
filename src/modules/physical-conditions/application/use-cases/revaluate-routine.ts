import type { RoutineRevaluation } from '../ports/routine-revaluation.port';

/**
 * Dispara la reevaluación de la rutina vigente tras un cambio de condiciones
 * (RN-91, FL-12, criterio 21).
 *
 * **No propaga el error.** Si la reevaluación falla, la condición ya quedó
 * registrada y eso es lo que el alumno pidió: tumbarle la declaración porque
 * no se pudo remarcar su rutina sería perder el dato de salud por un problema
 * secundario. El ejercicio queda sin remarcar hasta la próxima reevaluación,
 * que es el mismo grado de degradación que acepta RNF-12 para las capacidades
 * que dependen de otra parte del sistema.
 *
 * Se registra en consola para que el fallo no pase inadvertido: sin rastro,
 * una rutina mal marcada parecería correcta.
 */
export async function reevaluarRutina(
  revaluation: RoutineRevaluation | undefined,
  studentId: string,
): Promise<void> {
  if (!revaluation) {
    return;
  }

  try {
    await revaluation.revaluateForStudent(studentId);
  } catch (error) {
    console.error(
      '[conditions] la reevaluacion de la rutina vigente fallo (RN-91)',
      error,
    );
  }
}
