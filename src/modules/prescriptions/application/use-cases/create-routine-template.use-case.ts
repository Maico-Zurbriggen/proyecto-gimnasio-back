import { assertTemplateStructure } from '../../domain/services/template-structure';
import type {
  PrescriptionsRepository,
  WriteTemplateCommand,
} from '../ports/prescriptions.repository';

export interface CreateRoutineTemplateInput extends WriteTemplateCommand {
  trainerId: string;
}

/**
 * Creación manual de una plantilla (RF-019, RF-020, RF-082).
 *
 * La plantilla nace activa en el gimnasio del entrenador y no prescribe por
 * sí sola: asignarla copia su contenido como rutina PROPUESTA (RF-022) y
 * editarla después no reescribe lo ya asignado (RN-33).
 */
export class CreateRoutineTemplateUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(
    input: CreateRoutineTemplateInput,
  ): Promise<{ templateId: string }> {
    assertTemplateStructure(input.days);
    return this.prescriptions.createTemplate(input.trainerId, {
      name: input.name.trim(),
      routineType: input.routineType,
      days: input.days,
    });
  }
}
