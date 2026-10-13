import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutineGenerationsController } from './routine-generations.controller';

export function createRoutineGenerationsRouter(
  controller: RoutineGenerationsController,
  requireMeasurementAccess: RequestHandler,
  requireAssignment: RequestHandler,
): Router {
  const router = Router();

  // El alumno solicita para sí; el entrenador, para un alumno con asignación
  // vigente (decisión PO 2026-10-10: desvío de RF-025, registrado en D12).
  // La salida validada se materializa como PROPUESTA y no entra en vigencia
  // hasta que el entrenador asignado la aprueba por el flujo de revisión.
  const alumnoOEntrenadorAsignado = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR'),
    requireStudentOwnership('studentId'),
    requireAssignment,
    requireMeasurementAccess,
  ];

  // POST /students/:studentId/routine-generations
  router.post(
    '/students/:studentId/routine-generations',
    ...alumnoOEntrenadorAsignado,
    controller.request,
  );

  // GET /students/:studentId/routine-generations/:requestId
  router.get(
    '/students/:studentId/routine-generations/:requestId',
    ...alumnoOEntrenadorAsignado,
    controller.getById,
  );

  router.post(
    '/students/:studentId/routine-generations/:requestId/finalize',
    ...alumnoOEntrenadorAsignado,
    controller.finalize,
  );

  return router;
}
