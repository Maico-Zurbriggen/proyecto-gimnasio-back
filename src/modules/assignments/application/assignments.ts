import type { AuthUser } from '../../../shared/types/auth';

/**
 * Asignación entrenador–alumno por el administrador (RF-066, FL-01/A2).
 *
 * Un alumno tiene a lo sumo una asignación vigente. Cambiar de entrenador
 * cierra la anterior y abre otra (el historial se conserva), y lo que esperaba
 * a un entrenador —rutinas y propuestas bloqueadas por no tenerlo— pasa a la
 * bandeja del nuevo (RF-109, RF-112).
 */

export interface StudentAssignmentRecord {
  studentId: string;
  displayName: string;
  email: string;
  trainer: { id: string; displayName: string } | null;
  assignedAt: Date | null;
}

export interface TrainerOptionRecord {
  id: string;
  displayName: string;
  studentCount: number;
}

export interface AssignTrainerResult {
  studentId: string;
  trainer: { id: string; displayName: string };
  /** Asignación anterior que se cerró, si había otra. */
  previousTrainerId: string | null;
  /** Rutinas y propuestas que pasaron de BLOQUEADA a la bandeja. */
  unblockedRoutines: number;
  unblockedProposals: number;
}

export interface AssignmentsRepository {
  listStudents(gymId: string): Promise<StudentAssignmentRecord[]>;
  listTrainers(gymId: string): Promise<TrainerOptionRecord[]>;
  /**
   * Asigna el entrenador en una transacción. `'ALUMNO_INEXISTENTE'` o
   * `'ENTRENADOR_INVALIDO'` si alguno no es del gimnasio del actor.
   */
  assign(input: {
    gymId: string;
    actorUserId: string;
    studentId: string;
    trainerId: string;
  }): Promise<
    AssignTrainerResult | 'ALUMNO_INEXISTENTE' | 'ENTRENADOR_INVALIDO'
  >;
}

export class StudentNotInGymError extends Error {
  constructor(message = 'El alumno no existe en este gimnasio') {
    super(message);
    this.name = 'StudentNotInGymError';
  }
}

export class InvalidTrainerError extends Error {
  constructor(
    message = 'El entrenador no existe en este gimnasio o no tiene perfil de entrenador',
  ) {
    super(message);
    this.name = 'InvalidTrainerError';
  }
}

export class SelfAssignmentError extends Error {
  constructor(message = 'Una persona no puede ser su propio entrenador') {
    super(message);
    this.name = 'SelfAssignmentError';
  }
}

/** Casos de uso del panel de asignaciones; el gimnasio sale del actor. */
export class AssignmentsUseCases {
  constructor(private readonly repository: AssignmentsRepository) {}

  async overview(actor: AuthUser) {
    const [students, trainers] = await Promise.all([
      this.repository.listStudents(actor.gymId),
      this.repository.listTrainers(actor.gymId),
    ]);
    return {
      students: students.map((student) => ({
        ...student,
        assignedAt: student.assignedAt?.toISOString() ?? null,
      })),
      trainers,
    };
  }

  async assign(actor: AuthUser, studentId: string, trainerId: string) {
    // RN-22a: quien entrena necesita otro entrenador; nunca a sí mismo.
    if (studentId === trainerId) throw new SelfAssignmentError();
    const result = await this.repository.assign({
      gymId: actor.gymId,
      actorUserId: actor.id,
      studentId,
      trainerId,
    });
    if (result === 'ALUMNO_INEXISTENTE') throw new StudentNotInGymError();
    if (result === 'ENTRENADOR_INVALIDO') throw new InvalidTrainerError();
    return result;
  }
}
