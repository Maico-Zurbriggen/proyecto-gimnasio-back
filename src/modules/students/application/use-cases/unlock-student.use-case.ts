import type { Clock } from '../../../routines/application/ports/clock';
import {
  MeasurementBlockAlreadyResolvedError,
  PendingMeasurementRequiredError,
  StudentNotBlockedError,
  StudentNotFoundError,
  TrainerNotAssignedError,
} from '../../domain/errors/student-errors';
import {
  toStudentStatusDto,
  type StudentStatusDto,
} from '../dto/student-status.dto';
import type { StudentsRepository } from '../ports/students.repository';

export interface UnlockStudentInput {
  trainerId: string;
  studentId: string;
}

/**
 * El entrenador aprueba la regularización que el alumno ya cargó. La asignación
 * vigente y la transición se comprueban dentro de la misma transacción.
 */
export class UnlockStudentUseCase {
  constructor(
    private readonly students: StudentsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: UnlockStudentInput): Promise<StudentStatusDto> {
    const now = this.clock.now();
    const result = await this.students.unlock({
      studentId: input.studentId,
      trainerId: input.trainerId,
      approvedAt: now,
    });
    if (result === 'NOT_ASSIGNED') {
      throw new TrainerNotAssignedError();
    }
    if (result === 'PENDING_MEASUREMENT') {
      throw new PendingMeasurementRequiredError();
    }
    if (result === 'NOT_BLOCKED') {
      throw new StudentNotBlockedError();
    }
    if (result === 'ALREADY_RESOLVED') {
      throw new MeasurementBlockAlreadyResolvedError();
    }

    const student = await this.students.findById(input.studentId);
    if (!student) {
      throw new StudentNotFoundError();
    }

    return toStudentStatusDto(student);
  }
}
