import { Router } from 'express';

import {
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { GymsController } from './gyms.controller';

export function createGymsRouter(controller: GymsController): Router {
  const router = Router();

  // HU13 - criterio 17: sólo el SuperAdmin. Sin sesión 401; cualquier rol de
  // gimnasio —incluido el administrador— 403.
  const superAdmin = [requireAuth, requireRoles('SUPERADMIN')];

  router.get('/platform/timezones', ...superAdmin, controller.timezones);
  router.get('/platform/gyms', ...superAdmin, controller.list);
  router.post('/platform/gyms', ...superAdmin, controller.create);
  router.patch('/platform/gyms/:gymId', ...superAdmin, controller.update);
  router.post('/platform/gyms/:gymId/status', ...superAdmin, controller.status);
  router.post(
    '/platform/gyms/:gymId/bootstrap-invitation',
    ...superAdmin,
    controller.reissue,
  );

  return router;
}
