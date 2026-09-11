import { differenceInCalendarDays } from './routine-renewal';

/**
 * Reglas de datos actualizados para la renovación de ciclo (HU03 - T2, T3 y T4).
 *
 * Son funciones puras: reciben lo que necesitan y no consultan la base ni el
 * reloj. El job de renovación (HU03 - T1) las invoca con los datos ya leídos.
 *
 * [SUPUESTO] Que una medición corporal condicione una propuesta de adaptación no
 * proviene del corpus documental: lo pidió el usuario final. D5/RN-79a diagnostica
 * sobre carga máxima estimada, cumplimiento de repeticiones y esfuerzo percibido;
 * las mediciones corporales no participan de ningún criterio. Registrar en
 * `planning/risks-and-assumptions.md` cuando se actualice el corpus.
 */

/** Cantidad de faltas consecutivas a partir de la cual el alumno queda bloqueado. */
export const FALTAS_PARA_BLOQUEO = 3;

/** Una medición corporal fechada, reducida a lo que estas reglas necesitan. */
export interface MedicionFechada {
  measuredOn: Date;
}

/**
 * Una propuesta de renovación ya resuelta o emitida, en orden cronológico
 * inverso (de la más reciente a la más antigua).
 */
export interface PropuestaDeRenovacion {
  createdAt: Date;
  /** `true` si esa propuesta se generó sin medición nueva en su ciclo. */
  sinDatosActualizados: boolean;
}

/**
 * T2 — Determina si el alumno registró alguna medición corporal dentro del ciclo.
 *
 * Cuenta como dentro del ciclo toda medición **posterior** a su fecha de inicio.
 * Una medición del mismo día en que arrancó el ciclo no cuenta: pertenece al
 * ciclo anterior, que es el que la motivó.
 */
export function hayMedicionEnElCiclo(
  mediciones: readonly MedicionFechada[],
  inicioDelCiclo: Date,
): boolean {
  return mediciones.some(
    (medicion) =>
      differenceInCalendarDays(medicion.measuredOn, inicioDelCiclo) > 0,
  );
}

/**
 * T3 — Cuenta las faltas consecutivas del alumno.
 *
 * Una falta es un ciclo cerrado sin medición nueva. El conteo se **deriva** del
 * historial de propuestas en lugar de persistirse en un contador: así nunca queda
 * desincronizado si se corrige o se elimina una medición, y coincide con la regla
 * de D4/PD-03 de derivar todo lo que sea función pura de los datos crudos.
 *
 * Recorre las propuestas de la más reciente hacia atrás y corta en la primera que
 * sí tuvo datos actualizados: lo que importa es la racha vigente, no el total
 * histórico.
 */
export function contarFaltasConsecutivas(
  propuestasMasRecientePrimero: readonly PropuestaDeRenovacion[],
): number {
  let faltas = 0;

  for (const propuesta of propuestasMasRecientePrimero) {
    if (!propuesta.sinDatosActualizados) {
      break;
    }
    faltas += 1;
  }

  return faltas;
}

/**
 * Determina si el alumno alcanzó el tope de faltas que habilita el bloqueo.
 *
 * La decisión de bloquear es HU03 - T5 y vive en el módulo `users`; esta función
 * sólo informa si se alcanzó el umbral.
 */
export function alcanzoElTopeDeFaltas(faltasConsecutivas: number): boolean {
  return faltasConsecutivas >= FALTAS_PARA_BLOQUEO;
}

/** Resultado de evaluar los datos de una renovación de ciclo. */
export interface EvaluacionDatosRenovacion {
  /** T4 — la propuesta se marca así cuando no hubo medición nueva en el ciclo. */
  sinDatosActualizados: boolean;
  /** T3 — faltas consecutivas, incluida la de este ciclo si corresponde. */
  faltasConsecutivas: number;
  /** `true` cuando las faltas alcanzan el tope de HU03 - T5. */
  alcanzoTopeDeFaltas: boolean;
  /** Qué dato faltó, para declararlo en la propuesta (HU03, Esc. 2). */
  datoFaltante?: string;
}

/**
 * T2 + T3 + T4 — Evalúa los datos de un ciclo cumplido.
 *
 * Se ejecuta cuando el ciclo llegó a su vencimiento. Devuelve si la propuesta debe
 * marcarse como generada sin datos actualizados, cuántas faltas consecutivas
 * acumula el alumno contando la de este ciclo, y qué dato faltó.
 */
export function evaluarDatosDeRenovacion(
  mediciones: readonly MedicionFechada[],
  inicioDelCiclo: Date,
  propuestasPreviasMasRecientePrimero: readonly PropuestaDeRenovacion[] = [],
): EvaluacionDatosRenovacion {
  const tieneMedicionNueva = hayMedicionEnElCiclo(mediciones, inicioDelCiclo);
  const sinDatosActualizados = !tieneMedicionNueva;

  const faltasPrevias = contarFaltasConsecutivas(
    propuestasPreviasMasRecientePrimero,
  );
  // Una medición nueva corta la racha; sin ella, este ciclo suma una falta más.
  const faltasConsecutivas = sinDatosActualizados ? faltasPrevias + 1 : 0;

  return {
    sinDatosActualizados,
    faltasConsecutivas,
    alcanzoTopeDeFaltas: alcanzoElTopeDeFaltas(faltasConsecutivas),
    datoFaltante: sinDatosActualizados
      ? 'medicion corporal posterior al inicio del ciclo'
      : undefined,
  };
}
