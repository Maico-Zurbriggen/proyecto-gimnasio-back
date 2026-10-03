import {
  EmptyTemplateError,
  PendingProposalError,
  StudentNotFoundError,
  TemplateFromAnotherGymError,
  TemplateNotFoundError,
} from '../../domain/errors/prescription-errors';
import { resolveDominantPattern } from '../../domain/services/dominant-pattern';
import type { PrescriptionsRepository } from '../ports/prescriptions.repository';

export interface AssignRoutineFromTemplateInput {
  trainerId: string;
  studentId: string;
  templateId: string;
}

export interface AssignRoutineFromTemplateResult {
  routineId: string;
  versionId: string;
  state: 'PROPUESTA';
}

/**
 * Asignación de una rutina a partir de una plantilla (RF-022, RF-110).
 *
 * La plantilla se **copia**, no se referencia: a partir de acá la rutina del
 * alumno es suya y editar la plantilla no reescribe lo que ya se le prescribió.
 * `source_template_id` queda registrado sólo como procedencia.
 *
 * La rutina nace en **PROPUESTA**: nada rige sin la aprobación explícita del
 * entrenador, que es un paso aparte (`ReviewRoutineUseCase`).
 */
export class AssignRoutineFromTemplateUseCase {
  constructor(private readonly prescriptions: PrescriptionsRepository) {}

  async execute(
    input: AssignRoutineFromTemplateInput,
  ): Promise<AssignRoutineFromTemplateResult> {
    const studentGymId = await this.prescriptions.findStudentGymId(
      input.studentId,
    );
    if (!studentGymId) {
      throw new StudentNotFoundError();
    }

    const template = await this.prescriptions.findTemplateContent(
      input.templateId,
    );
    if (!template) {
      throw new TemplateNotFoundError();
    }
    // Un gimnasio no prescribe con las plantillas de otro: el catálogo y el
    // equipamiento que las sostienen son de su ámbito.
    if (template.gymId !== studentGymId) {
      throw new TemplateFromAnotherGymError();
    }

    const days = template.days.filter((day) => day.exercises.length > 0);
    if (days.length === 0) {
      throw new EmptyTemplateError();
    }

    // Dos propuestas sin resolver dejarían al entrenador sin saber cuál rige al
    // aprobar la segunda. Se resuelve la anterior antes de crear otra.
    const existentes = await this.prescriptions.listByStudent(input.studentId);
    if (existentes.some((routine) => routine.state === 'PROPUESTA')) {
      throw new PendingProposalError();
    }

    const created = await this.prescriptions.createProposedRoutine({
      studentId: input.studentId,
      requestedByUserId: input.trainerId,
      sourceTemplateId: template.id,
      routineType: template.routineType,
      // La frecuencia objetivo es la cantidad de días que la plantilla propone.
      targetWeeklyFrequency: days.length,
      days: days.map((day) => ({
        position: day.position,
        name: day.name,
        dominantPattern: resolveDominantPattern(day),
        exercises: day.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          position: exercise.position,
          note: exercise.note,
          sets: exercise.sets,
        })),
      })),
    });

    return { ...created, state: 'PROPUESTA' };
  }
}
