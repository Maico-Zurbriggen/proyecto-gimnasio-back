import type { NextFunction, Request, Response } from 'express';

import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import type { GetProposalReviewUseCase } from '../../application/use-cases/get-proposal-review.use-case';
import type { ListTrainerProposalsUseCase } from '../../application/use-cases/list-trainer-proposals.use-case';
import type { ResolveProposalUseCase } from '../../application/use-cases/resolve-proposal.use-case';
import {
  AdjustmentNotApplicableError,
  InvalidResolutionError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  RoutineNotAvailableError,
} from '../../domain/errors/proposal-errors';
import {
  proposalParamsSchema,
  resolutionBodySchema,
} from './proposals.schemas';

function sendProposalError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof TrainerNotAssignedError) {
    res.status(403).json({ error: 'forbidden_not_assigned' });
    return;
  }
  if (error instanceof ProposalNotFoundError) {
    res.status(404).json({ error: 'proposal_not_found' });
    return;
  }
  if (error instanceof ProposalNotPendingError) {
    res.status(409).json({ error: 'proposal_not_pending' });
    return;
  }
  if (error instanceof RoutineNotAvailableError) {
    res.status(409).json({ error: 'routine_not_available' });
    return;
  }
  if (error instanceof InvalidResolutionError) {
    res.status(422).json({ error: 'invalid_resolution', code: error.code });
    return;
  }
  if (error instanceof AdjustmentNotApplicableError) {
    res.status(422).json({
      error: 'adjustment_not_applicable',
      adjustmentId: error.adjustmentId,
      reason: error.reason,
    });
    return;
  }
  next(error);
}

export class ProposalsController {
  constructor(
    private readonly listTrainerProposals: ListTrainerProposalsUseCase,
    private readonly getProposalReview: GetProposalReviewUseCase,
    private readonly resolveProposal: ResolveProposalUseCase,
  ) {}

  listMine = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const proposals = await this.listTrainerProposals.execute({
        trainerId: req.user?.id ?? '',
      });
      res.status(200).json(proposals);
    } catch (error) {
      sendProposalError(error, res, next);
    }
  };

  getReview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = proposalParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const review = await this.getProposalReview.execute({
        trainerId: req.user?.id ?? '',
        proposalId: params.data.proposalId,
      });
      res.status(200).json(review);
    } catch (error) {
      sendProposalError(error, res, next);
    }
  };

  resolve = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = proposalParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = resolutionBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const resolution = await this.resolveProposal.execute({
        trainerId: req.user?.id ?? '',
        proposalId: params.data.proposalId,
        ...body.data,
      });
      res.status(200).json(resolution);
    } catch (error) {
      sendProposalError(error, res, next);
    }
  };
}
