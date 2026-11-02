import { Router } from 'express';
import type { ElaborateWeeklyAdjustmentProposalsUseCase } from '../../application/use-cases/elaborate-weekly-adjustment-proposals.use-case';
import { hasValidCronSecret } from '../../../../shared/middleware/cron-auth';

export function createAdjustmentProposalsJobRouter(
  job: ElaborateWeeklyAdjustmentProposalsUseCase,
): Router {
  const router = Router();
  router.get('/internal/jobs/adjustment-proposals', async (req, res, next) => {
    if (!hasValidCronSecret(req)) {
      res.status(401).json({ error: 'unauthorized_job' });
      return;
    }
    try {
      res.json(await job.execute());
    } catch (error) {
      next(error);
    }
  });
  return router;
}
