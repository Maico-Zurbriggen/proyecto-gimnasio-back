import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  GoalAccessError,
  GoalsUseCases,
} from '../../application/use-cases/goals.use-cases';
import { goalTypes } from '../../domain/goal-policy';

const params = z.object({ studentId: z.string().uuid() });
const body = z.object({ type: z.enum(goalTypes) }).strict();
const query = z
  .object({
    at: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).optional(),
  })
  .strict();

export class GoalsController {
  constructor(private readonly goals: GoalsUseCases) {}
  read = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = params.safeParse(req.params);
    const date = query.safeParse(req.query);
    if (!parsed.success || !date.success) {
      res.status(400).json({ error: 'invalid_request_parameters' });
      return;
    }
    try {
      res.json(
        await this.goals.read(req.user!, parsed.data.studentId, date.data.at),
      );
    } catch (error) {
      this.error(error, res, next);
    }
  };
  declare = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = params.safeParse(req.params);
    const value = body.safeParse(req.body);
    if (!parsed.success || !value.success) {
      res.status(400).json({ error: 'invalid_goal_request' });
      return;
    }
    try {
      const result = await this.goals.declare(
        req.user!,
        parsed.data.studentId,
        value.data.type,
      );
      res.status(result.changed ? 201 : 200).json(result);
    } catch (error) {
      this.error(error, res, next);
    }
  };
  private error(error: unknown, res: Response, next: NextFunction) {
    if (error instanceof GoalAccessError) {
      res.status(403).json({ error: 'forbidden_student_access' });
      return;
    }
    next(error);
  }
}
