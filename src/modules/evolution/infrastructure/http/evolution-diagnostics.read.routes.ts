import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';

import { requireAuth } from '../../../../shared/middleware/auth.middleware';
import { requireIndicatorsAccess } from '../../../indicators/infrastructure/indicators.access';
import type { TrainerAssignments } from '../../../students/application/ports/trainer-assignments.port';
import {
  StudentNotDiagnosableError,
  type DiagnoseEvolutionUseCase,
} from '../../application/use-cases/diagnose-evolution.use-case';
import type { GetEvolutionDiagnosticUseCase } from '../../application/use-cases/get-evolution-diagnostic.use-case';

const studentParams = z.object({
  studentId: z.string().uuid({ message: 'studentId must be a valid UUID' }),
});

/**
 * Consulta y recálculo del diagnóstico de evolución (HU32).
 *
 * El alumno lee el suyo y su entrenador con asignación vigente también; el
 * administrador recibe 403. Se reutiliza el guard de indicadores porque la
 * regla es la misma: el diagnóstico es un dato de seguimiento personal, no de
 * operación del gimnasio.
 */
export function createEvolutionDiagnosticsRouter(
  getDiagnostic: GetEvolutionDiagnosticUseCase,
  diagnoseOnDemand: DiagnoseEvolutionUseCase,
  trainerAssignments: TrainerAssignments,
): Router {
  const router = Router();
  const propiosOAsignados = [
    requireAuth,
    requireIndicatorsAccess(trainerAssignments, 'studentId'),
  ];

  router.get(
    '/students/:studentId/evolution-diagnostic',
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

        res
          .status(200)
          .json(await getDiagnostic.execute(params.data.studentId));
      } catch (error) {
        next(error);
      }
    },
  );

  // RN-78: el entrenador puede pedirlo antes de tiempo. A diferencia del job
  // semanal, acá no se aplica la periodicidad de dos semanas: el pedido
  // explícito es la excepción que la regla contempla (FL-09/A2).
  router.post(
    '/students/:studentId/evolution-diagnostic',
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

        res
          .status(201)
          .json(await diagnoseOnDemand.execute(params.data.studentId));
      } catch (error) {
        if (error instanceof StudentNotDiagnosableError) {
          res.status(409).json({ error: 'student_without_current_routine' });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
