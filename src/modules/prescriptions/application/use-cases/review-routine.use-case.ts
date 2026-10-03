import {
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
    const vigenteAnterior = aprueba
      ? (routines.find(
          (item) => item.state === 'VIGENTE' && item.id !== routine.id,
        )?.id ?? null)
      : null;

    await this.prescriptions.review({
      routineId: routine.id,
      versionId: routine.versionId,
      reviewerTrainerId: input.trainerId,
      result: input.result,
      observation: input.observation?.trim() ? input.observation.trim() : null,
      previousActiveRoutineId: vigenteAnterior,
    });

    return {
      routineId: routine.id,
      state: aprueba ? 'VIGENTE' : 'RECHAZADA',
      archivedRoutineId: vigenteAnterior,
    };
  }
}
