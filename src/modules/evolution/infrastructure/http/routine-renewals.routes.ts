import { Router } from 'express';
import type { RenewRoutineCyclesUseCase } from '../../application/use-cases/renew-routine-cycles.use-case';
import { hasValidCronSecret } from '../../../../shared/middleware/cron-auth';

export function createRoutineRenewalsRouter(
  renewals: RenewRoutineCyclesUseCase,
): Router {
  const router = Router();
  router.get('/internal/jobs/routine-renewals', async (req, res, next) => {
    if (!hasValidCronSecret(req)) {
      res.status(401).json({ error: 'unauthorized_job' });
      return;
    }
    try {
      res.json(await renewals.execute());
    } catch (error) {
      next(error);
    }
  });
  return router;
}
