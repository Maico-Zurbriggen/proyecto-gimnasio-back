import { Router, type RequestHandler } from 'express';

import { requireAuth } from '../../../../shared/middleware/auth.middleware';
import type { AuthController } from './auth.controller';

export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
): Router {
  const router = Router();

  // HU07 - T1: inicio de sesión. Público por definición.
  router.post('/auth/login', controller.login);

  // HU07 - T4: cierre explícito. No exige sesión válida: cerrar una sesión ya
  // vencida tiene que dejar al usuario deslogueado igual, no devolverle un 401.
  router.post('/auth/logout', controller.logout);

  // Identidad en curso, para que el frontend sepa si hay sesión (T7).
  router.get('/auth/me', authenticate, requireAuth, controller.me);

  return router;
}
