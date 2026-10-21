import { Router, type RequestHandler } from 'express';

import { hasValidCronSecret } from '../../../../shared/middleware/cron-auth';
import type { NextFunction, Request, Response } from 'express';
import {
  authenticate,
  requireAuth,
  requireRoles,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { TrainingSessionsController } from './training-sessions.controller';

function requireCron(req: Request, res: Response, next: NextFunction): void {
  if (!hasValidCronSecret(req)) {
    res.status(401).json({ error: 'unauthorized_job' });
    return;
  }
  next();
}

export function createTrainingSessionsRouter(
  controller: TrainingSessionsController,
  requireMeasurementAccess: RequestHandler,
  requireAssignment: RequestHandler,
) {
  const router = Router();

  const alumnoPropio = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireStudentOwnership('studentId'),
    requireMeasurementAccess,
  ];

  const alumnoOEntrenadorLectura = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR'),
    requireStudentOwnership('studentId'),
    requireAssignment,
  ];

  // T2 — Iniciar (FL-05 pasos 1 a 4, RN-50, RN-51, RN-52).
  router.post(
    '/students/:studentId/training-sessions',
    ...alumnoPropio,
    controller.start,
  );

  // T2 — Reanudar: la sesión EN_CURSO con su prescripción congelada (FL-07).
  // El entrenador con asignación la consulta desde el detalle del alumno.
  router.get(
    '/students/:studentId/training-sessions/active',
    ...alumnoOEntrenadorLectura,
    controller.active,
  );

  // Atajo del alumno autenticado, misma autorización que el anterior.
  router.get(
    '/training-sessions/active',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireMeasurementAccess,
    controller.active,
  );

  // Historial paginado del alumno (RF-035). Después de `/active` para que
  // el literal no lo capture `:sessionId`.
  router.get(
    '/students/:studentId/training-sessions',
    ...alumnoOEntrenadorLectura,
    controller.list,
  );

  // Detalle de una sesión: prescripto junto a ejecutado, serie por serie.
  router.get(
    '/students/:studentId/training-sessions/:sessionId',
    ...alumnoOEntrenadorLectura,
    controller.detail,
  );

  // T2 — Registro de series (RF-029, RN-55, RN-55a, RN-60, RN-61).
  router.patch(
    '/students/:studentId/training-sessions/:sessionId/records/:position',
    ...alumnoPropio,
    controller.patchSeries,
  );

  // T3 — Cierre manual: la sesión pasa a COMPLETADA (D6/§4, RF-027).
  router.post(
    '/students/:studentId/training-sessions/:sessionId/finish',
    ...alumnoPropio,
    controller.finish,
  );

  // FL-07 A1: el alumno prefiere descartarla; se cierra como ABANDONADA.
  router.post(
    '/students/:studentId/training-sessions/:sessionId/abandon',
    ...alumnoPropio,
    controller.abandon,
  );

  // T3 — Cierre automático por inactividad (RN-53, RN-58). Sólo el scheduler.
  // GET como el resto de jobs: los crons de Vercel invocan por GET.
  router.get(
    '/internal/jobs/training-sessions/expire',
    requireCron,
    controller.expire,
  );

  return router;
}
