import type { NextFunction, Request, Response } from 'express';

import type { TrainerAssignments } from '../../modules/students/application/ports/trainer-assignments.port';

/**
 * Segundo paso de la autorización sobre recursos de un alumno (RF-066, RA-07):
 * un ENTRENADOR sólo accede a los alumnos que tiene asignados con vigencia. El
 * propio alumno y el administrador pasan sin verificación adicional.
 */
export function requireTrainerAssignment(
  assignments: TrainerAssignments,
  paramName = 'studentId',
) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const rawStudentId = req.params[paramName];
    const studentId = typeof rawStudentId === 'string' ? rawStudentId : '';
    const esElPropioAlumno = user.id === studentId;
    const esAdministrador = user.roles.includes('ADMINISTRADOR');
    const esEntrenador = user.roles.includes('ENTRENADOR');

    if (!studentId || esElPropioAlumno || esAdministrador || !esEntrenador) {
      next();
      return;
    }

    try {
      if (await assignments.isActive(user.id, studentId)) {
        next();
        return;
      }
      res.status(403).json({ error: 'forbidden_not_assigned' });
    } catch (error) {
      next(error);
    }
  };
}
