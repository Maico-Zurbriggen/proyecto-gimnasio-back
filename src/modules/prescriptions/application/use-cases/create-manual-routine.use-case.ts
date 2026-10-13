import { PendingProposalError } from '../../domain/errors/prescription-errors';
import { assertTemplateStructure } from '../../domain/services/template-structure';
import type {
  PrescriptionsRepository,
  TrainingPurpose,
  TemplateDayInput,
} from '../ports/prescriptions.repository';

export interface CreateManualRoutineInput {
  trainerId: string;
  studentId: string;
  routineType: TrainingPurpose;
  days: TemplateDayInput[];
}

export interface CreateManualRoutineResult {
  routineId: string;
  versionId: string;
  state: 'PROPUESTA';
}

/**
 * Rutina manual del entrenador para su alumno (HU16).
 *
 * Sin plantilla de por medio: el entrenador arma días, ejercicios y series
 * directamente sobre el catálogo habilitado. La rutina nace en PROPUESTA —
 * nada rige sin revisión favorable (RN-35), que el propio entrenador
 * asignado registra por el flujo habitual.
 */
export class CreateManualRoutineUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(
    input: CreateManualRoutineInput,
  ): Promise<CreateManualRoutineResult> {
    assertTemplateStructure(input.days);

    const existentes = await this.prescriptions.listByStudent(input.studentId);
    if (existentes.some((routine) => routine.state === 'PROPUESTA')) {
      throw new PendingProposalError();
    }

    const created = await this.prescriptions.createManualRoutine({
      trainerId: input.trainerId,
      studentId: input.studentId,
      routineType: input.routineType,
      days: input.days,
    });

    return { ...created, state: 'PROPUESTA' };
  }
}
