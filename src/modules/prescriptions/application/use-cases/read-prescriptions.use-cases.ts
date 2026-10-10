import {
  RoutineNotFoundError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import type {
  PrescriptionsRepository,
  RoutineContent,
  RoutineSummary,
  RoutineTemplateDetail,
  RoutineTemplateSummary,
} from '../ports/prescriptions.repository';

/** Plantillas que el entrenador puede asignar, del gimnasio al que pertenece. */
export class ListRoutineTemplatesUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  execute(trainerId: string): Promise<RoutineTemplateSummary[]> {
    return this.prescriptions.listTemplatesForTrainer(trainerId);
  }
}

/**
 * Detalle editable de una plantilla del gimnasio del entrenador, con sus
 * días, ejercicios y series ordenados.
 */
export class GetRoutineTemplateUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(input: {
    trainerId: string;
    templateId: string;
  }): Promise<RoutineTemplateDetail> {
    const detail = await this.prescriptions.findTemplateDetail(
      input.trainerId,
      input.templateId,
    );
    if (!detail) {
      throw new TemplateNotFoundError();
    }
    return detail;
  }
}

/** Rutinas del alumno, de la más reciente a la más vieja. */
export class ListStudentRoutinesUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  execute(studentId: string): Promise<RoutineSummary[]> {
    return this.prescriptions.listByStudent(studentId);
  }
}

/**
 * Contenido de una rutina: días, ejercicios y series.
 *
 * Se pide siempre por alumno y rutina juntos, de modo que una rutina de otro
 * alumno responda «no existe» en lugar de filtrar su contenido.
 */
export class GetRoutineContentUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(input: {
    studentId: string;
    routineId: string;
  }): Promise<RoutineContent> {
    const content = await this.prescriptions.findContent(
      input.studentId,
      input.routineId,
    );
    if (!content) {
      throw new RoutineNotFoundError();
    }
    return content;
  }
}
