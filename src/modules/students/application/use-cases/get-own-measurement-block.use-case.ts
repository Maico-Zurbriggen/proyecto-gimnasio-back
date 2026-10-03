import { StudentNotFoundError } from '../../domain/errors/student-errors';
import {
  toStudentStatusDto,
  type StudentStatusDto,
} from '../dto/student-status.dto';
import type { StudentsRepository } from '../ports/students.repository';

/** Estado propio de mediciones, disponible incluso durante el bloqueo funcional. */
export class GetOwnMeasurementBlockUseCase {
  constructor(private readonly students: StudentsRepository) {}

  async execute(studentId: string): Promise<StudentStatusDto> {
    const student = await this.students.findById(studentId);
    if (!student) {
      throw new StudentNotFoundError();
    }

    return toStudentStatusDto(student);
  }
}
