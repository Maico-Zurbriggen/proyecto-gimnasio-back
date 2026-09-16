import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutineGenerationsController } from './routine-generations.controller';

export function createRoutineGenerationsRouter(
  controller: RoutineGenerationsController,
): Router {
  const router = Router();

  // POST /students/:studentId/routine-generations
  // Solo ENTRENADOR/ADMINISTRADOR: el alumno nunca ve un candidato de rutina sin
  // aprobar (gate RoutineReview), y ai_generation_requests no guarda studentId
  // (boundary sin FK a app), así que no hay forma de probar ownership 403 para
  // ALUMNO sobre este recurso -- se lo excluye en vez de exponer un IDOR.
  router.post(
    '/students/:studentId/routine-generations',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR', 'ADMINISTRADOR'),
    controller.request,
  );

  // GET /students/:studentId/routine-generations/:requestId
  router.get(
    '/students/:studentId/routine-generations/:requestId',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR', 'ADMINISTRADOR'),
    controller.getById,
  );

  return router;
}
