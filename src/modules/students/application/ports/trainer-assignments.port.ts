/**
 * Asignación vigente entrenador–alumno (RF-066). Es el segundo paso de la
 * autorización: además del rol, el entrenador debe tener al alumno a cargo.
 */
export interface TrainerAssignments {
  isActive(trainerId: string, studentId: string): Promise<boolean>;
}
