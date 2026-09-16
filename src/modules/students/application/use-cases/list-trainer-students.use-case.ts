import type { Clock } from '../../../routines/application/ports/clock';
import {
  toTrainerStudentDto,
  type TrainerStudentDto,
} from '../dto/student-status.dto';
import type { StudentsRepository } from '../ports/students.repository';

/**
 * Cartera del entrenador: sólo alumnos con asignación vigente. Ordena primero los
 * bloqueados y los que tienen propuestas pendientes, y después por nombre.
 */
export class ListTrainerStudentsUseCase {
  constructor(
    private readonly students: StudentsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: { trainerId: string }): Promise<TrainerStudentDto[]> {
    const now = this.clock.now();
    const records = await this.students.findAssignedToTrainer(query.trainerId);

    return records
      .map((record) => toTrainerStudentDto(record, now))
      .sort(
        (a, b) =>
          Number(b.bloqueado) - Number(a.bloqueado) ||
          b.propuestasPendientes - a.propuestasPendientes ||
          a.displayName.localeCompare(b.displayName, 'es'),
      );
  }
}
