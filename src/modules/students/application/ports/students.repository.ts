import type { StudentAccountState } from '../../domain/services/student-block';

export interface StudentRecord {
  id: string;
  displayName: string;
  state: StudentAccountState;
  registeredAt: Date;
  heightCm: number;
  lastMeasurementOn: Date | null;
}

export interface AssignedStudentRecord extends StudentRecord {
  goal: string | null;
  activeRoutine: { routineType: string; cycleStart: Date } | null;
  pendingProposals: number;
}

export interface UnlockStudentCommand {
  studentId: string;
  trainerId: string;
  weightKg: number;
  heightCm: number;
  measuredOn: Date;
}

export interface StudentsRepository {
  findById(studentId: string): Promise<StudentRecord | null>;
  findAssignedToTrainer(trainerId: string): Promise<AssignedStudentRecord[]>;
  /**
   * Registra la medición adeudada, actualiza la altura y reactiva al alumno en una
   * única transacción (HU05 - T1). Devuelve `false` si al confirmar el alumno ya no
   * estaba SUSPENDIDO; en ese caso no persiste nada.
   */
  unlock(command: UnlockStudentCommand): Promise<boolean>;
}
