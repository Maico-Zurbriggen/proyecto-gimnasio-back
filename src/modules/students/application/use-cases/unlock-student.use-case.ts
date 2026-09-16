import type { Clock } from '../../../routines/application/ports/clock';
import {
  StudentNotBlockedError,
  StudentNotFoundError,
  TrainerNotAssignedError,
} from '../../domain/errors/student-errors';
import {
  toStudentStatusDto,
  type StudentStatusDto,
} from '../dto/student-status.dto';
import type { StudentsRepository } from '../ports/students.repository';
import type { TrainerAssignments } from '../ports/trainer-assignments.port';

export interface UnlockStudentInput {
  trainerId: string;
  studentId: string;
  weightKg: number;
  heightCm: number;
}

/**
 * Desbloqueo por el entrenador (HU05 - T1). Verifica la asignación vigente, exige la
 * medición adeudada y reactiva al alumno en una operación atómica. Las faltas vuelven
 * a 0 porque se derivan de la última medición, que pasa a ser la de hoy.
 */
export class UnlockStudentUseCase {
  constructor(
    private readonly students: StudentsRepository,
    private readonly assignments: TrainerAssignments,
    private readonly clock: Clock,
  ) {}

  async execute(input: UnlockStudentInput): Promise<StudentStatusDto> {
    if (!(await this.assignments.isActive(input.trainerId, input.studentId))) {
      throw new TrainerNotAssignedError();
    }

    const student = await this.students.findById(input.studentId);
    if (!student) {
      throw new StudentNotFoundError();
    }
    if (student.state !== 'SUSPENDIDO') {
      throw new StudentNotBlockedError();
    }

    const now = this.clock.now();
    const measuredOn = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    const unlocked = await this.students.unlock({
      studentId: input.studentId,
      trainerId: input.trainerId,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      measuredOn,
    });
    if (!unlocked) {
      throw new StudentNotBlockedError();
    }

    return toStudentStatusDto(
      {
        ...student,
        state: 'ACTIVO',
        heightCm: input.heightCm,
        lastMeasurementOn: measuredOn,
      },
      now,
    );
  }
}
