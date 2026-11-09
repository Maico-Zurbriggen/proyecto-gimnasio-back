import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';

import {
  requireAuth,
  requireStudentOwnership,
} from '../../../shared/middleware/auth.middleware';
import {
  RoutineDayNotFoundError,
  type GetSetPreloadUseCase,
} from '../application/set-preload.use-cases';

const preloadParams = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
  routineDayId: z
    .string()
    .uuid({ message: 'routineDayId must be a valid UUID' }),
});

export function createTrainingSessionsRouter(
  getSetPreload: GetSetPreloadUseCase,
): Router {
  const router = Router();

  // El alumno consulta la precarga de su sesión; su entrenador también, para
  // ver con qué valores va a entrenar. Doble filtro de RA-01.
  const propiosOAsignados = [requireAuth, requireStudentOwnership('studentId')];

  // HU22 - T2: valores precargados de las series de un día (RF-030).
  router.get(
    '/students/:studentId/routine-days/:routineDayId/set-preload',
    ...propiosOAsignados,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = preloadParams.safeParse(req.params);
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
            await getSetPreload.execute(
              params.data.studentId,
              params.data.routineDayId,
            ),
          );
      } catch (error) {
        if (error instanceof RoutineDayNotFoundError) {
          res.status(404).json({ error: 'routine_day_not_found' });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
