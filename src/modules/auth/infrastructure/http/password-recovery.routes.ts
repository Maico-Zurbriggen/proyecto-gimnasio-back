import { Router } from 'express';
import { requireAuth } from '../../../../shared/middleware/auth.middleware';
import type { PasswordRecoveryController } from './password-recovery.controller';
export function createPasswordRecoveryRouter(
  controller: PasswordRecoveryController,
) {
  const router = Router();
  router.post('/auth/password-recovery', controller.request);
  router.post('/auth/password-reset', controller.reset);
  router.post('/auth/password-change', requireAuth, controller.change);
  return router;
}
