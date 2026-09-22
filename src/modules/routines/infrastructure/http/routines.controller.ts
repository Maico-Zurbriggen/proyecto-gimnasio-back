import type { NextFunction, Request, Response } from 'express';

import type { DetectExpiredCyclesUseCase } from '../../application/use-cases/detect-expired-cycles.use-case';
import type { GetActiveRoutineUseCase } from '../../application/use-cases/get-active-routine.use-case';
import {
  RoutineNotActiveError,
  RoutineNotFoundError,
} from '../../domain/errors/routine-errors';
import { getActiveRoutineParamsSchema } from './routines.schemas';

export class RoutinesController {
  constructor(
    private readonly getActiveRoutineUseCase: GetActiveRoutineUseCase,
    private readonly detectExpiredCyclesUseCase: DetectExpiredCyclesUseCase,
  ) {}

  getActive = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      let studentId = req.params.studentId;

      if (!studentId && req.user) {
        studentId = req.user.id;
      }

      const validatedParams = getActiveRoutineParamsSchema.safeParse({
        studentId,
      });

      if (!validatedParams.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: validatedParams.error.flatten(),
        });
        return;
      }

      const activeRoutine = await this.getActiveRoutineUseCase.execute({
        studentId: validatedParams.data.studentId,
      });

      res.status(200).json(activeRoutine);
    } catch (error) {
      if (error instanceof RoutineNotFoundError) {
        res.status(404).json({ error: 'active_routine_not_found' });
        return;
      }

      if (error instanceof RoutineNotActiveError) {
        res.status(409).json({ error: 'routine_not_active' });
        return;
      }

      next(error);
    }
  };

  checkRenewal = async (
    _req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.detectExpiredCyclesUseCase.execute();

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  };
}
