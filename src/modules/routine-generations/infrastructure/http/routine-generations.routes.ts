import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireSelfOrStaff,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutineGenerationsController } from './routine-generations.controller';

export function createRoutineGenerationsRouter(
  controller: RoutineGenerationsController,
): Router {
  const router = Router();

  // POST /students/:studentId/routine-generations
  // Solicitud de rutina generada (RF-025): el alumno pide para sí mismo desde
  // su perfil; el personal pide para cualquier alumno. El ownership
  // solicitud→alumno queda en app.routine_generation_ownership porque
  // ai_generation_requests no guarda studentId (frontera sin FK a app).
  router.post(
    '/students/:studentId/routine-generations',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR'),
    requireSelfOrStaff('studentId'),
    controller.request,
  );

  // GET /students/:studentId/routine-generations/latest
  // Recupera la solicitud más reciente para tolerar recargas o respuestas
  // perdidas después de persistir el POST.
  router.get(
    '/students/:studentId/routine-generations/latest',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR'),
    requireSelfOrStaff('studentId'),
    controller.getLatest,
  );

  // GET /students/:studentId/routine-generations/:requestId
  // El alumno sólo ve sus propias solicitudes (404 si no le pertenecen, para
  // no revelar existencia); el personal conserva el acceso actual.
  router.get(
    '/students/:studentId/routine-generations/:requestId',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR'),
    requireSelfOrStaff('studentId'),
    controller.getById,
  );

  return router;
}
