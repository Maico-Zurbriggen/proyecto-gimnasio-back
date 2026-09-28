export type MeasurementBlockState =
  'PENDIENTE_MEDICION' | 'PENDIENTE_APROBACION';

export interface ActiveMeasurementBlock {
  state: MeasurementBlockState;
  reason: 'TRES_FALTAS_CONSECUTIVAS';
  consecutiveMissesAtBlock: number;
  blockedAt: Date;
  submittedAt: Date | null;
}

export interface StudentBlockInput {
  activeBlock: ActiveMeasurementBlock | null;
  /** Controles cerrados desde el más reciente hacia atrás. */
  checkpointResults: Array<'CUMPLIDO' | 'FALTA'>;
}

export interface StudentBlockStatus {
  bloqueado: boolean;
  measurementBlockState: 'NORMAL' | MeasurementBlockState;
  motivoBloqueo: string | null;
  faltasConsecutivas: number;
  blockedAt: Date | null;
  submittedAt: Date | null;
}

const MOTIVO_POR_DEFECTO =
  'Bloqueado por faltas consecutivas a la renovación de rutina.';

/**
 * Estado de bloqueo del alumno (HU05 - T2).
 *
 * El bloqueo funcional se obtiene exclusivamente de `student_measurement_blocks`.
 * La suspensión administrativa del usuario no participa. Sin bloqueo activo, la
 * racha se deriva de checkpoints persistidos y se corta en el primer CUMPLIDO.
 */
export function evaluateStudentBlock(
  input: StudentBlockInput,
): StudentBlockStatus {
  const block = input.activeBlock;
  const faltasConsecutivas = block
    ? block.consecutiveMissesAtBlock
    : input.checkpointResults.findIndex((result) => result === 'CUMPLIDO') ===
        -1
      ? input.checkpointResults.length
      : input.checkpointResults.findIndex((result) => result === 'CUMPLIDO');

  return {
    bloqueado: block !== null,
    measurementBlockState: block?.state ?? 'NORMAL',
    motivoBloqueo: block ? MOTIVO_POR_DEFECTO : null,
    faltasConsecutivas,
    blockedAt: block?.blockedAt ?? null,
    submittedAt: block?.submittedAt ?? null,
  };
}
