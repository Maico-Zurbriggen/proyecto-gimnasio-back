import type { ActiveMeasurementBlock } from '../../domain/services/student-block';

export interface StudentRecord {
  id: string;
  displayName: string;
  registeredAt: Date;
  heightCm: number;
  lastMeasurementOn: Date | null;
  activeMeasurementBlock: ActiveMeasurementBlock | null;
  checkpointResults: Array<'CUMPLIDO' | 'FALTA'>;
}

export interface AssignedStudentRecord extends StudentRecord {
  goal: string | null;
  activeRoutine: { routineType: string; cycleStart: Date } | null;
  pendingRoutineReviews: number;
  pendingAdaptationProposals: number;
}

export interface UnlockStudentCommand {
  studentId: string;
  trainerId: string;
  approvedAt: Date;
}

export type UnlockStudentResult =
  | 'APPROVED'
  | 'NOT_ASSIGNED'
  | 'PENDING_MEASUREMENT'
  | 'NOT_BLOCKED'
  | 'ALREADY_RESOLVED';

export interface StudentsRepository {
  findById(studentId: string): Promise<StudentRecord | null>;
  findAssignedToTrainer(trainerId: string): Promise<AssignedStudentRecord[]>;
  /**
   * Aprueba la regularización ya cargada. La asignación y el estado se vuelven a
   * comprobar dentro de la transacción.
   */
  unlock(command: UnlockStudentCommand): Promise<UnlockStudentResult>;
}
