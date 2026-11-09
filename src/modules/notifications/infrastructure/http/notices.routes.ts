import { Router } from 'express';

import { requireAuth } from '../../../../shared/middleware/auth.middleware';
import type { NoticesController } from './notices.controller';

export function createNoticesRouter(controller: NoticesController): Router {
  const router = Router();
  router.get('/notices', requireAuth, controller.list);
  router.patch('/notices/read-all', requireAuth, controller.readAll);
  router.patch('/notices/:noticeId/read', requireAuth, controller.read);
  return router;
}
