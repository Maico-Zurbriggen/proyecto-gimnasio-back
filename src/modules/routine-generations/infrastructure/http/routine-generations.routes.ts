import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireSelf,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutineGenerationsController } from './routine-generations.controller';

export function createRoutineGenerationsRouter(
  controller: RoutineGenerationsController,
  requireMeasurementAccess: RequestHandler,
): Router {
  const router = Router();

  // POST /students/:studentId/routine-generations
  // Sólo el alumno puede iniciar una generación y exclusivamente para sí.
  // La salida validada se materializa como PROPUESTA y no entra en vigencia
  // hasta que el entrenador asignado la aprueba por el flujo de revisión.
  router.post(
    '/students/:studentId/routine-generations',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireSelf(),
    requireMeasurementAccess,
    controller.request,
  );

  // GET /students/:studentId/routine-generations/:requestId
  router.get(
    '/students/:studentId/routine-generations/:requestId',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireSelf(),
    requireMeasurementAccess,
    controller.getById,
  );

  router.post(
    '/students/:studentId/routine-generations/:requestId/finalize',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireSelf(),
    requireMeasurementAccess,
    controller.finalize,
  );

  return router;
}
