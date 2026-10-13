import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import type { ExerciseCatalogService } from '../../application/catalog.service';
import { CatalogError } from '../../domain/catalog';
import {
  availabilitySchema,
  catalogQuerySchema,
  exerciseInputSchema,
  exerciseParamsSchema,
  inventorySchema,
  reviewExerciseSchema,
  updateExerciseSchema,
} from './catalog.schemas';

export class ExerciseCatalogController {
  constructor(private readonly service: ExerciseCatalogService) {}

  private action = async (
    res: Response,
    next: NextFunction,
    run: () => Promise<unknown>,
    status = 200,
  ) => {
    try {
      res.status(status).json(await run());
    } catch (error) {
      if (error instanceof ZodError) {
        res
          .status(400)
          .json({ error: 'invalid_catalog_request', details: error.flatten() });
        return;
      }
      if (error instanceof CatalogError) {
        res.status(error.status).json({ error: error.code });
        return;
      }
      next(error);
    }
  };

  taxonomies = (_req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () => this.service.taxonomies());
  list = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () =>
      this.service.list(req.user!, catalogQuerySchema.parse(req.query)),
    );
  find = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () =>
      this.service.find(
        req.user!,
        exerciseParamsSchema.parse(req.params).exerciseId,
      ),
    );
  create = (req: Request, res: Response, next: NextFunction) =>
    this.action(
      res,
      next,
      () => this.service.create(req.user!, exerciseInputSchema.parse(req.body)),
      201,
    );
  update = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () => {
      const { expectedRevision, exercise } = updateExerciseSchema.parse(
        req.body,
      );
      return this.service.update(
        req.user!,
        exerciseParamsSchema.parse(req.params).exerciseId,
        expectedRevision,
        exercise,
      );
    });
  review = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () => {
      const { expectedRevision, state, observation, enable } =
        reviewExerciseSchema.parse(req.body);
      return this.service.review(
        req.user!,
        exerciseParamsSchema.parse(req.params).exerciseId,
        expectedRevision,
        state,
        observation,
        enable,
      );
    });
  availability = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () =>
      this.service.setAvailability(
        req.user!,
        availabilitySchema.parse(req.body).changes,
      ),
    );
  inventory = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () => this.service.inventory(req.user!));
  updateInventory = (req: Request, res: Response, next: NextFunction) =>
    this.action(res, next, () => {
      const { equipment, expectedRevision } = inventorySchema.parse(req.body);
      return this.service.setInventory(req.user!, equipment, expectedRevision);
    });
}
