import { timingSafeEqual } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

import type { EvaluateMeasurementCheckpointsUseCase } from '../../application/use-cases/evaluate-measurement-checkpoints.use-case';

function hasValidCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.get('authorization');
  if (!secret || !authorization) {
    return false;
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(authorization);
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}

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
