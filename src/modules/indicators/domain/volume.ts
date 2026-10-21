/**
 * Volumen por grupo muscular (RN-62, RN-63).
 *
 * Se mide en **series efectivas**, no en tonelaje: el glosario prohíbe el
 * tonelaje por no ser comparable entre ejercicios (D2/§2).
 */

/** Aporte de una serie al grupo donde el ejercicio tiene participación primaria. */
export const PESO_PARTICIPACION_PRIMARIA = 1.0;

/** Aporte a cada grupo con participación secundaria. */
export const PESO_PARTICIPACION_SECUNDARIA = 0.5;

/**
 * Las ponderaciones 1,0 y 0,5 son una convención documentada, no un hecho
 * fisiológico (RN-63). Conviene decirlo al presentar el indicador.
 */

export type Participacion = 'PRIMARIA' | 'SECUNDARIA';

/** Serie completada, con la clasificación muscular del ejercicio ejecutado. */
export interface SerieConMusculos {
  warmup: boolean;
  completed: boolean;
  /**
   * Grupos que el ejercicio ejecutado involucra.
   *
   * Vacío significa **no clasificado**, que no es lo mismo que aportar cero: el
   * ejercicio no suma a ningún grupo y esa ausencia se distingue (RN-30).
   */
  musculos: readonly { grupo: string; participacion: Participacion }[];
}

/** Volumen acumulado por grupo muscular, en series efectivas. */
export type VolumenPorGrupo = Map<string, number>;

/**
 * Volumen por grupo muscular de un conjunto de series (RN-62).
 *
 * Sólo cuentan las series de trabajo completadas (RN-54). Cada una aporta 1,0
 * al grupo primario y 0,5 a cada secundario.
 */
export function volumenPorGrupo(
  series: readonly SerieConMusculos[],
): VolumenPorGrupo {
  const volumen: VolumenPorGrupo = new Map();

  for (const serie of series) {
    if (serie.warmup || !serie.completed) {
      continue;
    }

    for (const { grupo, participacion } of serie.musculos) {
      const aporte =
        participacion === 'PRIMARIA'
          ? PESO_PARTICIPACION_PRIMARIA
          : PESO_PARTICIPACION_SECUNDARIA;

      volumen.set(grupo, (volumen.get(grupo) ?? 0) + aporte);
    }
  }

  // El redondeo evita que la suma de medios arrastre error de coma flotante.
  for (const [grupo, total] of volumen) {
    volumen.set(grupo, Math.round(total * 10) / 10);
  }

  return volumen;
}
