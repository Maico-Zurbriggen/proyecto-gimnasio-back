import { Router } from 'express';

import type { MeasurementCheckpointsController } from './measurement-checkpoints.controller';

export function createMeasurementCheckpointsRouter(
  controller: MeasurementCheckpointsController,
): Router {
  const router = Router();
  router.get('/internal/jobs/measurement-blocks', controller.evaluate);
  return router;
}
