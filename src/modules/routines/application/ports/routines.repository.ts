import type { Routine } from '../../domain/entities/routine.entity';

/**
 * Una rutina vigente con los insumos que el job de renovación (HU03 - T1)
 * necesita para detectar ciclos cumplidos.
 */
export interface RenewalCheckCandidate {
  routine: Routine;
  /** Fechas de todas las mediciones corporales del alumno. */
  measurementDates: Date[];
  /**
   * Creación de las propuestas de adaptación anteriores del alumno, de la más
   * reciente a la más antigua.
   */
  previousProposalDates: Date[];
}

export interface RoutinesRepository {
  findActiveByStudentId(studentId: string): Promise<Routine | null>;
  findVigentesForRenewalCheck(): Promise<RenewalCheckCandidate[]>;
}
