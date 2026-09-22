import type {
  MovementPattern,
  TemplateContentDay,
} from '../../application/ports/prescriptions.repository';

/**
 * Patrón dominante de un día de rutina.
 *
 * `routine_days.dominant_pattern` es obligatorio y las plantillas no lo guardan:
 * `template_days` sólo tiene nombre y posición. Se deriva entonces del contenido
 * del día, que es donde vive la información real.
 *
 * La regla es el patrón más frecuente entre sus ejercicios. Ante un empate gana
 * el que aparece primero, porque el primer ejercicio del día es el principal y el
 * resto suele ser accesorio: es el criterio que un entrenador aplicaría al
 * nombrar el día.
 */
export function resolveDominantPattern(
  day: TemplateContentDay,
): MovementPattern {
  const primero = day.exercises[0];
  if (!primero) {
    // Un día sin ejercicios no llega acá: el caso de uso rechaza antes la
    // plantilla vacía. El CORE es el patrón más neutro si alguna vez llegara.
    return 'CORE';
  }

  const frecuencias = new Map<MovementPattern, number>();
  for (const ejercicio of day.exercises) {
    frecuencias.set(
      ejercicio.movementPattern,
      (frecuencias.get(ejercicio.movementPattern) ?? 0) + 1,
    );
  }

  let dominante = primero.movementPattern;
  let mayorFrecuencia = frecuencias.get(dominante) ?? 0;

  // Se recorre en el orden de los ejercicios, no el del mapa, para que el
  // desempate sea el del primero que aparece y no dependa de la inserción.
  for (const ejercicio of day.exercises) {
    const frecuencia = frecuencias.get(ejercicio.movementPattern) ?? 0;
    if (frecuencia > mayorFrecuencia) {
      dominante = ejercicio.movementPattern;
      mayorFrecuencia = frecuencia;
    }
  }

  return dominante;
}
