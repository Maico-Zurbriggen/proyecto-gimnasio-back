import type { NextFunction, Request, Response } from 'express';

import type { TrainerAssignments } from '../../students/application/ports/trainer-assignments.port';

/**
 * Acceso a los indicadores de un alumno (HU23/HU26, RA-01).
 *
 * El doble filtro que pide el corpus, aplicado estrictamente:
 *
 * 1. El alumno accede a lo suyo y sólo a lo suyo.
 * 2. El entrenador accede a los indicadores de sus alumnos, y la asignación
 *    tiene que estar **vigente**: haber sido su entrenador alguna vez no
 *    alcanza.
 * 3. Cualquier otro rol recibe 403, **incluido el administrador**. Es la
 *    diferencia con `requireStudentOwnership`, que trata al administrador como
 *    staff: los indicadores son datos de seguimiento personal, no de
 *    operación del gimnasio, y el criterio de aceptación de HU23 lo dice
 *    explícitamente. Por eso este guard es propio del módulo y no un cambio al
 *    middleware compartido, que otros módulos usan con la semántica contraria.
 */
export function requireIndicatorsAccess(
  trainerAssignments: TrainerAssignments,
  paramName = 'studentId',
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const parametro: unknown = req.params[paramName];
    const targetStudentId =
      typeof parametro === 'string' ? parametro : undefined;
    if (targetStudentId === undefined) {
      res.status(400).json({ error: 'invalid_request_parameters' });
      return;
    }

    // El alumno sobre sí mismo: el caso más común y el más barato de resolver.
    if (user.id === targetStudentId && user.roles.includes('ALUMNO')) {
      next();
      return;
    }

    if (!user.roles.includes('ENTRENADOR')) {
      res.status(403).json({ error: 'forbidden_student_access' });
      return;
    }

    trainerAssignments
      .isActive(user.id, targetStudentId)
      .then((vigente) => {
        if (!vigente) {
          res.status(403).json({ error: 'forbidden_student_access' });
          return;
        }
        next();
      })
      .catch(next);
  };
}
