import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { UsersController } from './users.controller';

export function createUsersRouter(controller: UsersController): Router {
  const router = Router();

  // Endpoint para evaluar inactividad de un usuario y bloquearlo ante la 3ª falta (T5)
  router.post(
    '/users/:userId/inactivity-check',
    authenticate,
    requireAuth,
    requireRoles('ADMINISTRADOR'),
    controller.checkInactivity,
  );

  return router;
}
