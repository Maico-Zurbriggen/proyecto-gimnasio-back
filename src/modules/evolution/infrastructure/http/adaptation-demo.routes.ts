import { Router, type NextFunction, type Response } from 'express';
import {
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { AdaptationDemoUseCases } from '../../application/use-cases/adaptation-demo.use-cases';
import { AdaptationDemoError } from '../../domain/services/adaptation-demo';
import { TrainerNotAssignedError } from '../../../students/domain/errors/student-errors';
import { CatalogError } from '../../../exercise-catalog/domain/catalog';
import {
  adaptationDemoParamsSchema,
  prepareAdaptationDemoSchema,
} from './adaptation-demo.schemas';

function sendError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof AdaptationDemoError || error instanceof CatalogError)
    res.status(error.status).json({ error: error.code });
  else if (error instanceof TrainerNotAssignedError)
    res.status(403).json({ error: 'forbidden_not_assigned' });
  else next(error);
}

export function createAdaptationDemoRouter(
  useCases: AdaptationDemoUseCases,
): Router {
  const router = Router();
  router.use('/demo/adaptations', requireAuth, requireRoles('ENTRENADOR'));
  router.get('/demo/adaptations', async (req, res, next) => {
    try {
      res.json({
        students: await useCases.list({
          trainerId: req.user!.id,
          gymId: req.user!.gymId,
        }),
      });
    } catch (error) {
      sendError(error, res, next);
    }
  });
  router.post('/demo/adaptations/:studentId', async (req, res, next) => {
    const params = adaptationDemoParamsSchema.safeParse(req.params);
    const body = prepareAdaptationDemoSchema.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: 'invalid_demo_request' });
      return;
    }
    try {
      res.json(
        await useCases.prepare(
          { trainerId: req.user!.id, gymId: req.user!.gymId },
          params.data.studentId,
          body.data.scenario,
        ),
      );
    } catch (error) {
      sendError(error, res, next);
    }
  });
  router.post(
    '/demo/adaptations/:studentId/restore',
    async (req, res, next) => {
      const params = adaptationDemoParamsSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({ error: 'invalid_demo_request' });
        return;
      }
      try {
        res.json(
          await useCases.restore(
            { trainerId: req.user!.id, gymId: req.user!.gymId },
            params.data.studentId,
          ),
        );
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );
  return router;
}
