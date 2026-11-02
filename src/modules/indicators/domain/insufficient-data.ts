/**
 * Estado explícito de «sin datos suficientes» (HU24, RN-73).
 *
 * Un indicador que no se puede calcular nunca se devuelve como 0, null o vacío:
 * declara qué falta, cuánto hay, cuánto falta y qué hacer al respecto.
 */
export interface InsufficientData {
  status: 'SIN_DATOS_SUFICIENTES';
  /** Qué dato falta. */
  missing: string;
  /** Unidad de `required`, `available` y `remaining`. */
  unit: string;
  required: number;
  available: number;
  remaining: number;
  /** Qué hacer para completarlo, en español. */
  action: string;
}

export function sinDatosSuficientes(
  missing: string,
  unit: string,
  required: number,
  available: number,
  action: string,
): InsufficientData {
  return {
    status: 'SIN_DATOS_SUFICIENTES',
    missing,
    unit,
    required,
    available,
    remaining: Math.max(0, required - available),
    action,
  };
}
