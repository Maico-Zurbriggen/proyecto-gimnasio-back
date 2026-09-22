import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutineGenerationsController } from './routine-generations.controller';

export function createRoutineGenerationsRouter(
  controller: RoutineGenerationsController,
  requireAssignment: RequestHandler,
): Router {
  const router = Router();

  // POST /students/:studentId/routine-generations
  // Sólo el entrenador actualmente asignado puede solicitar y consultar la
  // generación. La asociación request/alumno/solicitante evita IDOR durante polling.
  router.post(
    '/students/:studentId/routine-generations',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
    requireAssignment,
    controller.request,
  );

  // GET /students/:studentId/routine-generations/:requestId
  router.get(
    '/students/:studentId/routine-generations/:requestId',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
    requireAssignment,
    controller.getById,
  );

  router.post(
    '/students/:studentId/routine-generations/:requestId/finalize',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
    requireAssignment,
    controller.finalize,
  );

  return router;
}
