import type { Clock } from '../../../routines/application/ports/clock';
import {
  toTrainerStudentDto,
  type TrainerStudentIndicators,
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
    private readonly indicators: {
      get(studentId: string): Promise<TrainerStudentIndicators>;
    },
  ) {}

  async execute(query: { trainerId: string }): Promise<TrainerStudentDto[]> {
    const now = this.clock.now();
    const records = await this.students.findAssignedToTrainer(query.trainerId);

    const students = await Promise.all(
      records.map(async (record) =>
        toTrainerStudentDto(record, now, await this.indicators.get(record.id)),
      ),
    );

    return students.sort(
      (a, b) =>
        a.prioridad - b.prioridad ||
        a.displayName.localeCompare(b.displayName, 'es'),
    );
  }
}
