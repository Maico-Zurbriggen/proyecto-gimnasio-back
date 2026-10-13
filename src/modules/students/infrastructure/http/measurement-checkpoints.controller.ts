import type { NextFunction, Request, Response } from 'express';
import { hasValidCronSecret } from '../../../../shared/middleware/cron-auth';

import type { EvaluateMeasurementCheckpointsUseCase } from '../../application/use-cases/evaluate-measurement-checkpoints.use-case';

export class MeasurementCheckpointsController {
  constructor(
    private readonly evaluateCheckpoints: EvaluateMeasurementCheckpointsUseCase,
  ) {}

  evaluate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!hasValidCronSecret(req)) {
      res.status(401).json({ error: 'unauthorized_job' });
      return;
    }

    try {
      const result = await this.evaluateCheckpoints.execute();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
