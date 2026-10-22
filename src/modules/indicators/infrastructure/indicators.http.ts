import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';

import { requireAuth } from '../../../shared/middleware/auth.middleware';
import type { TrainerAssignments } from '../../students/application/ports/trainer-assignments.port';
import { requireIndicatorsAccess } from './indicators.access';
import {
  SessionNotFoundError,
  type GetAdherenceUseCase,
  type GetSessionComplianceUseCase,
  type GetSignalsUseCase,
} from '../application/indicators.use-cases';

const studentParams = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

const sessionParams = studentParams.extend({
  sessionId: z.string().uuid({ message: 'sessionId must be a valid UUID' }),
});

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof SessionNotFoundError) {
    res.status(404).json({ error: 'session_not_found' });
    return;
  }
  next(error);
}

export function createIndicatorsRouter(
  getAdherence: GetAdherenceUseCase,
  getSessionCompliance: GetSessionComplianceUseCase,
  getSignals: GetSignalsUseCase,
  trainerAssignments: TrainerAssignments,
): Router {
  const router = Router();

  // El alumno consulta sus indicadores; su entrenador con asignación vigente
  // también. El administrador no: son datos de seguimiento personal, y el
  // criterio de aceptación de HU23 le asigna 403 explícitamente.
  const propiosOAsignados = [
    requireAuth,
    requireIndicatorsAccess(trainerAssignments, 'studentId'),
  ];

  // HU23 - T1: adherencia sobre la ventana móvil de cuatro semanas.
  router.get(
    '/students/:studentId/indicators/adherence',
    ...propiosOAsignados,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = studentParams.safeParse(req.params);
        if (!params.success) {
          res.status(400).json({
            error: 'invalid_request_parameters',
            details: params.error.flatten(),
          });
          return;
        }

        res.status(200).json(await getAdherence.execute(params.data.studentId));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  // HU23 - T2: cumplimiento de series y de repeticiones de una sesión.
  router.get(
    '/students/:studentId/sessions/:sessionId/compliance',
    ...propiosOAsignados,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = sessionParams.safeParse(req.params);
        if (!params.success) {
          res.status(400).json({
            error: 'invalid_request_parameters',
            details: params.error.flatten(),
          });
          return;
        }

        res
          .status(200)
          .json(
            await getSessionCompliance.execute(
              params.data.sessionId,
              params.data.studentId,
            ),
          );
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  // HU26 - T1: estancamiento, caída de adherencia y desbalance.
  router.get(
    '/students/:studentId/indicators/signals',
    ...propiosOAsignados,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = studentParams.safeParse(req.params);
        if (!params.success) {
          res.status(400).json({
            error: 'invalid_request_parameters',
            details: params.error.flatten(),
          });
          return;
        }

        res.status(200).json(await getSignals.execute(params.data.studentId));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
