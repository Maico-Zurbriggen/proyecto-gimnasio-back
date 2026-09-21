/**
 * Rangos fisiológicos admisibles para la carga de medidas (HU02 - T2).
 *
 * La validación es del lado del servidor y el mensaje de error nombra el rango
 * admitido, como exigen los escenarios 1.1 y 1.2. Los límites son inclusivos: los
 * valores exactos 20,0 kg, 250,0 kg, 100 cm y 250 cm se aceptan (escenario 1.3).
 *
 * [SUPUESTO] El rango de peso de la HU (20,0-250,0 kg) no coincide con D5/RN-17,
 * que admite 20,0-400,0 kg. Se implementa el de la HU porque es contra lo que se
 * verifica, y porque el desbloqueo de HU05 ya lo usa. Registrar en
 * `planning/risks-and-assumptions.md` cuando se actualice el corpus.
 */

export const PESO_MIN_KG = 20;
export const PESO_MAX_KG = 250;
export const ALTURA_MIN_CM = 100;
export const ALTURA_MAX_CM = 250;

/** Magnitud fuera de rango, con el rango que el mensaje de error debe nombrar. */
export interface ViolacionDeRango {
  campo: 'weightKg' | 'heightCm';
  valor: number;
  min: number;
  max: number;
  unidad: 'kg' | 'cm';
  mensaje: string;
}

function fueraDeRango(
  campo: ViolacionDeRango['campo'],
  valor: number,
  min: number,
  max: number,
  unidad: ViolacionDeRango['unidad'],
): ViolacionDeRango | null {
  if (Number.isFinite(valor) && valor >= min && valor <= max) {
    return null;
  }

  return {
    campo,
    valor,
    min,
    max,
    unidad,
    mensaje: `El valor admitido para ${campo} está entre ${String(min)} y ${String(max)} ${unidad}`,
  };
}

/** Valida el peso corporal en kilogramos. Devuelve `null` si está dentro del rango. */
export function validarPeso(weightKg: number): ViolacionDeRango | null {
  return fueraDeRango('weightKg', weightKg, PESO_MIN_KG, PESO_MAX_KG, 'kg');
}

/** Valida la altura en centímetros. Devuelve `null` si está dentro del rango. */
export function validarAltura(heightCm: number): ViolacionDeRango | null {
  return fueraDeRango('heightCm', heightCm, ALTURA_MIN_CM, ALTURA_MAX_CM, 'cm');
}

/**
 * Valida peso y altura juntos.
 *
 * Devuelve **todas** las violaciones, no la primera: si los dos valores están mal,
 * el alumno tiene que enterarse de ambos en el mismo intento. Mientras haya al
 * menos una, no se persiste ningún dato (escenarios 1.1 y 1.2).
 */
export function validarMedidas(
  weightKg: number,
  heightCm: number,
): ViolacionDeRango[] {
  return [validarPeso(weightKg), validarAltura(heightCm)].filter(
    (violacion): violacion is ViolacionDeRango => violacion !== null,
  );
}
