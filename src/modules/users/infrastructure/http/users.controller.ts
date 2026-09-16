import type { NextFunction, Request, Response } from 'express';

import type { BlockUserOnInactivityUseCase } from '../../application/use-cases/block-user-on-inactivity.use-case';
import { UserNotFoundError } from '../../domain/errors/user-errors';
import {
  inactivityCheckBodySchema,
  inactivityCheckParamsSchema,
} from './users.schemas';

export class UsersController {
  constructor(
    private readonly blockUserOnInactivityUseCase: BlockUserOnInactivityUseCase,
  ) {}

  checkInactivity = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsedParams = inactivityCheckParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: parsedParams.error.flatten(),
        });
        return;
      }

      const parsedBody = inactivityCheckBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: parsedBody.error.flatten(),
        });
        return;
      }

      const lastDataDate = parsedBody.data.lastDataDate
        ? new Date(parsedBody.data.lastDataDate)
        : undefined;

      const result = await this.blockUserOnInactivityUseCase.execute({
        userId: parsedParams.data.userId,
        consecutiveFaltas: parsedBody.data.consecutiveFaltas,
        daysInactive: parsedBody.data.daysInactive,
        lastDataDate,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof UserNotFoundError) {
        res.status(404).json({ error: 'user_not_found' });
        return;
      }

      next(error);
    }
  };
}
