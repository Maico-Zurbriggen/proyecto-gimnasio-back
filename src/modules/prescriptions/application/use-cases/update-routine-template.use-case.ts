import { assertTemplateStructure } from '../../domain/services/template-structure';
import type {
  PrescriptionsRepository,
  WriteTemplateCommand,
} from '../ports/prescriptions.repository';

export interface UpdateRoutineTemplateInput extends WriteTemplateCommand {
  trainerId: string;
  templateId: string;
}

export interface SetRoutineTemplateActiveInput {
  trainerId: string;
  templateId: string;
  active: boolean;
}

/**
 * Edición manual de una plantilla (RF-019, RF-020).
 *
 * Reemplaza el contenido: las rutinas ya creadas a partir de ella conservan
 * su copia y no se ven afectadas (RN-33). Sólo sobre plantillas activas; una
 * plantilla desactivada se reactiva antes de editarse.
 */
export class UpdateRoutineTemplateUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(input: UpdateRoutineTemplateInput): Promise<void> {
    assertTemplateStructure(input.days);
    await this.prescriptions.updateTemplate(input.trainerId, input.templateId, {
      name: input.name.trim(),
      routineType: input.routineType,
      days: input.days,
    });
  }
}

/**
 * Baja y reactivación de una plantilla del gimnasio. La baja nunca borra: las
 * rutinas ya creadas siguen consultables y las sesiones intactas.
 */
export class SetRoutineTemplateActiveUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(
    input: SetRoutineTemplateActiveInput,
  ): Promise<{ active: boolean }> {
    return this.prescriptions.setTemplateActive(
      input.trainerId,
      input.templateId,
      input.active,
    );
  }
}
