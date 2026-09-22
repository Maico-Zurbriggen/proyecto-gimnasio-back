import { Router } from 'express';

import type { AuthController } from './auth.controller';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  // Sesión por cookie httpOnly (HU07). Sin guards: login crea la sesión,
  // me/logout resuelven la cookie y responden 401/204 según corresponda.
  router.post('/auth/login', controller.login);
  router.get('/auth/me', controller.me);
  router.post('/auth/logout', controller.logout);

  return router;
}
