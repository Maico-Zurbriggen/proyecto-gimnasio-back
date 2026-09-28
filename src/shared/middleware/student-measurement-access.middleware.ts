import type { NextFunction, Request, RequestHandler, Response } from 'express';

import type { StudentMeasurementAccess } from '../../modules/students/application/ports/student-measurement-access.port';

/**
 * Restringe sólo la actuación como ALUMNO. Una cuenta multirrol que consulta a
 * otro alumno como entrenador conserva sus capacidades de entrenador.
 */
export function requireStudentMeasurementAccess(
  access: StudentMeasurementAccess,
  studentParam = 'studentId',
): RequestHandler {
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

    const targetStudentId = req.params[studentParam];
    const actsAsStudent =
      user.roles.includes('ALUMNO') &&
      (!targetStudentId || targetStudentId === user.id);
    if (!actsAsStudent) {
      next();
      return;
    }

    try {
      const state = await access.findActiveBlockState(user.id);
      if (state) {
        res.status(423).json({
          error: 'student_measurement_blocked',
          measurementBlockState: state,
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
