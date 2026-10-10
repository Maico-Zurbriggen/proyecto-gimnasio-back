import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { RegenerateProposalUseCase } from '../../application/use-cases/regenerate-proposal.use-case';
import { CatalogError } from '../../../exercise-catalog/domain/catalog';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import { ProposalNotFoundError } from '../../domain/errors/proposal-errors';
import type { ProposalRegeneration } from '../../application/ports/proposal-regenerations.repository';

function regenerationDto(value: ProposalRegeneration | null) {
  return value
    ? {
        id: value.id,
        proposalId: value.proposalId,
        trainerId: value.trainerId,
        feedback: value.feedback,
        candidateRequestId: value.candidateRequestId,
        requestId: value.requestId,
        state: value.state,
        error: value.error,
      }
    : null;
}

const params = z.object({ proposalId: z.string().uuid() });
const body = z
  .object({
    feedback: z.string().trim().min(1).max(2000),
    idempotencyKey: z.string().uuid(),
    candidateRequestId: z.string().uuid(),
  })
  .strict();

export function createProposalRegenerationsRouter(
  useCase: RegenerateProposalUseCase,
) {
  const router = Router();
  router.use(
    '/proposals/:proposalId/regeneration',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
  );
  const sendError = (
    error: unknown,
    res: import('express').Response,
    next: import('express').NextFunction,
  ) => {
    if (error instanceof CatalogError)
      res.status(error.status).json({ error: error.code });
    else if (error instanceof TrainerNotAssignedError)
      res.status(403).json({ error: 'forbidden_not_assigned' });
    else if (error instanceof ProposalNotFoundError)
      res.status(404).json({ error: 'proposal_not_found' });
    else next(error);
  };
  router.post('/proposals/:proposalId/regeneration', async (req, res, next) => {
    const route = params.safeParse(req.params),
      input = body.safeParse(req.body);
    if (!route.success || !input.success) {
      res.status(400).json({ error: 'invalid_regeneration_input' });
      return;
    }
    try {
      res.status(202).json(
        regenerationDto(
          await useCase.start({
            ...input.data,
            proposalId: route.data.proposalId,
            trainerId: req.user!.id,
          }),
        ),
      );
    } catch (error) {
      sendError(error, res, next);
    }
  });
  router.get('/proposals/:proposalId/regeneration', async (req, res, next) => {
    const route = params.safeParse(req.params);
    if (!route.success) {
      res.status(400).json({ error: 'invalid_request_parameters' });
      return;
    }
    try {
      res.json(
        regenerationDto(
          await useCase.status(route.data.proposalId, req.user!.id),
        ),
      );
    } catch (error) {
      sendError(error, res, next);
    }
  });
  return router;
}
