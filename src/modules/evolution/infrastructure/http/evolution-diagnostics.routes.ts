import { Router } from 'express';

import { hasValidCronSecret } from '../../../../shared/middleware/cron-auth';
import type { DiagnoseWeeklyEvolutionUseCase } from '../../application/use-cases/diagnose-evolution.use-case';

/**
 * Disparo del diagnóstico periódico (HU32 - T3, RN-78).
 *
 * Corre antes que el job de propuestas: ése toma los diagnósticos sin propuesta
 * de los últimos días, así que necesita que éstos ya existan.
 */
export function createEvolutionDiagnosticsJobRouter(
  job: DiagnoseWeeklyEvolutionUseCase,
): Router {
  const router = Router();

  router.get('/internal/jobs/evolution-diagnostics', async (req, res, next) => {
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
