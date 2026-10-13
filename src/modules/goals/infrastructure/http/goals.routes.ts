import { Router } from 'express';
import {
  requireAuth,
  requireRoles,
  requireSelf,
} from '../../../../shared/middleware/auth.middleware';
import type { GoalsController } from './goals.controller';
export function createGoalsRouter(controller: GoalsController) {
  const router = Router();
  router.get(
    '/students/:studentId/goals',
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR'),
    controller.read,
  );
  router.post(
    '/students/:studentId/goals',
    requireAuth,
    requireRoles('ALUMNO'),
    requireSelf(),
    controller.declare,
  );
  return router;
}
