import {
  RejectionReasonRequiredError,
  RoutineNotFoundError,
  RoutineNotReviewableError,
} from '../../domain/errors/prescription-errors';
import type {
  PrescriptionsRepository,
  RoutineReviewResult,
} from '../ports/prescriptions.repository';

export interface ReviewRoutineInput {
  trainerId: string;
  studentId: string;
  routineId: string;
  result: RoutineReviewResult;
  observation?: string;
  confirmGoalMismatch?: boolean;
}

export interface ReviewRoutineOutput {
  routineId: string;
  state: 'VIGENTE' | 'RECHAZADA';
  /** Rutina que se archivó al poner ésta en vigencia, si había una. */
  archivedRoutineId: string | null;
}

/**
 * Revisión de la rutina propuesta (RF-110, RF-092).
 *
 * Es la puerta del entrenador: una rutina sólo rige cuando él la aprueba, y la
 * decisión queda registrada en `routine_reviews` con quién la tomó y cuándo.
 *
 * Al aprobar, la rutina que estaba vigente se archiva en la misma transacción:
 * el alumno nunca tiene dos rutinas vigentes, y la anterior sigue consultable
 * porque se archiva en lugar de borrarse.
 *
 * Rechazar exige motivo (FL-02/A2), que llega al alumno en su aviso. La
 * transición sale de PROPUESTA de forma condicional en el repositorio: dos
 * decisiones simultáneas sobre la misma rutina no se pisan (HU17).
 */
export class ReviewRoutineUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(input: ReviewRoutineInput): Promise<ReviewRoutineOutput> {
    const routines = await this.prescriptions.listByStudent(input.studentId);
    const routine = routines.find((item) => item.id === input.routineId);
    if (!routine) {
      throw new RoutineNotFoundError();
    }
    if (routine.state !== 'PROPUESTA') {
      throw new RoutineNotReviewableError();
    }

    const aprueba = input.result !== 'RECHAZADA';
    const observation = input.observation?.trim()
      ? input.observation.trim()
      : null;
    if (!aprueba && !observation) {
      throw new RejectionReasonRequiredError();
    }

    const { archivedRoutineId } = await this.prescriptions.review({
      studentId: input.studentId,
      routineId: routine.id,
      versionId: routine.versionId,
      reviewerTrainerId: input.trainerId,
      result: input.result,
      observation,
      confirmGoalMismatch: input.confirmGoalMismatch,
    });

    return {
      routineId: routine.id,
      state: aprueba ? 'VIGENTE' : 'RECHAZADA',
      archivedRoutineId,
    };
  }
}
