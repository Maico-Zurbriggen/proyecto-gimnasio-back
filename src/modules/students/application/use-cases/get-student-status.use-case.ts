import type { Clock } from '../../../routines/application/ports/clock';
import {
  StudentNotFoundError,
  TrainerNotAssignedError,
} from '../../domain/errors/student-errors';
import {
  toStudentStatusDto,
  type StudentStatusDto,
} from '../dto/student-status.dto';
import type { StudentsRepository } from '../ports/students.repository';
import type { TrainerAssignments } from '../ports/trainer-assignments.port';

export interface GetStudentStatusQuery {
  trainerId: string;
  studentId: string;
}

/** Vista del alumno bloqueado en la ficha del entrenador (HU05 - T2). */
export class GetStudentStatusUseCase {
  constructor(
    private readonly students: StudentsRepository,
    private readonly assignments: TrainerAssignments,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetStudentStatusQuery): Promise<StudentStatusDto> {
    // Se verifica la asignación antes de buscar: sin ella no se revela si el alumno existe.
    if (!(await this.assignments.isActive(query.trainerId, query.studentId))) {
      throw new TrainerNotAssignedError();
    }

    const student = await this.students.findById(query.studentId);
    if (!student) {
      throw new StudentNotFoundError();
    }

    return toStudentStatusDto(student, this.clock.now());
  }
}
