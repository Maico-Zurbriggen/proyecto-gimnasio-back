import { evaluateInactivity } from '../../../users/domain/services/inactivity-strikes.service';

export type StudentAccountState = 'ACTIVO' | 'SUSPENDIDO';

export interface StudentBlockInput {
  state: StudentAccountState;
  /** Fecha de la última medición corporal registrada, si existe. */
  lastMeasurementOn: Date | null;
  /** Alta del usuario; reemplaza a la medición cuando nunca midió. */
  registeredAt: Date;
  now: Date;
}

export interface StudentBlockStatus {
  bloqueado: boolean;
  motivoBloqueo: string | null;
  faltasConsecutivas: number;
}

const MOTIVO_POR_DEFECTO =
  'Bloqueado por faltas consecutivas a la renovación de rutina.';

/**
 * Estado de bloqueo del alumno (HU05 - T2).
 *
 * `bloqueado` es el estado SUSPENDIDO del usuario: el esquema no tiene otra marca.
 * Las faltas no se persisten; se derivan con la misma regla de HU03 - T5 a partir
 * de los días transcurridos desde la última medición. Por eso registrar la medición
 * adeudada deja las faltas en 0 sin un contador que haya que resetear (HU05, Esc. 4).
 */
export function evaluateStudentBlock(
  input: StudentBlockInput,
): StudentBlockStatus {
  const evaluation = evaluateInactivity({
    lastDataDate: input.lastMeasurementOn ?? input.registeredAt,
    currentDate: input.now,
  });
  const bloqueado = input.state === 'SUSPENDIDO';

  return {
    bloqueado,
    motivoBloqueo: bloqueado ? (evaluation.reason ?? MOTIVO_POR_DEFECTO) : null,
    faltasConsecutivas: evaluation.consecutiveFaltas,
  };
}
