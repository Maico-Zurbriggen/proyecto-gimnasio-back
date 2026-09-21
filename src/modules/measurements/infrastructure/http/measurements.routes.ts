import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { MeasurementsController } from './measurements.controller';

export function createMeasurementsRouter(
  controller: MeasurementsController,
): Router {
  const router = Router();

  // HU02 - T1: el alumno carga sus medidas desde el aviso de renovación.
  // Doble filtro de RA-01: rol ALUMNO, y además que el recurso sea suyo.
  router.post(
    '/students/:studentId/measurements',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireStudentOwnership('studentId'),
    controller.record,
  );

  return router;
}
