import type { NextFunction, Request, Response } from 'express';

import {
  EmptyPrefilteredCatalogError,
  GeneratedRoutineInvalidError,
  MissingGenerationInputError,
  ProposedRoutineAlreadyExistsError,
  RoutineGenerationNotCompletedError,
  RoutineGenerationNotFoundError,
  RoutineGenerationOwnershipConflictError,
  RoutineGenerationUnavailableError,
  StudentNotFoundError,
} from '../../domain/errors/routine-generation-errors';
import type { GetRoutineGenerationUseCase } from '../../application/use-cases/get-routine-generation.use-case';
import type { FinalizeRoutineGenerationUseCase } from '../../application/use-cases/finalize-routine-generation.use-case';
import type { RequestRoutineGenerationUseCase } from '../../application/use-cases/request-routine-generation.use-case';
import {
  getGenerationParamsSchema,
  requestGenerationBodySchema,
  requestGenerationParamsSchema,
} from './routine-generations.schemas';

export class RoutineGenerationsController {
  constructor(
    private readonly requestRoutineGenerationUseCase: RequestRoutineGenerationUseCase,
    private readonly getRoutineGenerationUseCase: GetRoutineGenerationUseCase,
    private readonly finalizeRoutineGenerationUseCase: FinalizeRoutineGenerationUseCase,
  ) {}

  request = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsedParams = requestGenerationParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: parsedParams.error.flatten(),
        });
        return;
      }

      const parsedBody = requestGenerationBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: parsedBody.error.flatten(),
        });
        return;
      }

      if (!req.user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      const result = await this.requestRoutineGenerationUseCase.execute({
        studentId: parsedParams.data.studentId,
        requestedByUserId: req.user.id,
        freeText: parsedBody.data.textoLibre ?? undefined,
        parameters: parsedBody.data.parametros ?? undefined,
        idempotencyKey: parsedBody.data.idempotencyKey,
      });

      res.status(result.alreadyExisted ? 200 : 202).json({
        requestId: result.requestId,
        status: result.status,
      });
    } catch (error) {
      if (error instanceof MissingGenerationInputError) {
        res.status(422).json({ error: 'missing_generation_input' });
        return;
      }

      if (error instanceof StudentNotFoundError) {
        res.status(404).json({ error: 'student_not_found' });
        return;
      }

      if (error instanceof EmptyPrefilteredCatalogError) {
        res.status(422).json({ error: 'empty_prefiltered_catalog' });
        return;
      }

      if (error instanceof RoutineGenerationUnavailableError) {
        res.status(503).json({ error: 'ai_service_unavailable' });
        return;
      }

      if (error instanceof RoutineGenerationOwnershipConflictError) {
        res
          .status(409)
          .json({ error: 'routine_generation_ownership_conflict' });
        return;
      }

      next(error);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsedParams = getGenerationParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: parsedParams.error.flatten(),
        });
        return;
      }
      if (!req.user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      const snapshot = await this.getRoutineGenerationUseCase.execute({
        requestId: parsedParams.data.requestId,
        studentId: parsedParams.data.studentId,
        requestedByUserId: req.user.id,
      });

      res.status(200).json(snapshot);
    } catch (error) {
      if (error instanceof RoutineGenerationNotFoundError) {
        res.status(404).json({ error: 'routine_generation_not_found' });
        return;
      }

      next(error);
    }
  };

  finalize = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsedParams = getGenerationParamsSchema.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: parsedParams.error.flatten(),
        });
        return;
      }
      if (!req.user) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      const result = await this.finalizeRoutineGenerationUseCase.execute({
        requestId: parsedParams.data.requestId,
        studentId: parsedParams.data.studentId,
        requestedByUserId: req.user.id,
      });
      res.status(201).json(result);
    } catch (error) {
      if (error instanceof RoutineGenerationNotFoundError) {
        res.status(404).json({ error: 'routine_generation_not_found' });
        return;
      }
      if (error instanceof RoutineGenerationNotCompletedError) {
        res.status(409).json({ error: 'routine_generation_not_completed' });
        return;
      }
      if (error instanceof ProposedRoutineAlreadyExistsError) {
        res.status(409).json({ error: 'proposed_routine_already_exists' });
        return;
      }
      if (error instanceof GeneratedRoutineInvalidError) {
        res.status(422).json({
          error: 'invalid_generated_routine',
          violations: error.violations,
        });
        return;
      }
      next(error);
    }
  };
}
