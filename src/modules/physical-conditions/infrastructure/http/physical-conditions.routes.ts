import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireSelf,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { PhysicalConditionsController } from './physical-conditions.controller';

export function createPhysicalConditionsRouter(
  controller: PhysicalConditionsController,
  /** Asignación vigente del entrenador, sin excepción para el administrador. */
  requireAssignment: RequestHandler,
): Router {
  const router = Router();

  // Escribe sólo el propio alumno: el entrenador consulta pero no declara ni
  // modifica (criterio 16).
  const soloElAlumno = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    requireSelf('studentId'),
  ];

  // Leen el alumno y su entrenador con asignación vigente. El administrador no
  // accede al detalle (criterio 17, RA-06), y un entrenador sin asignación o de
  // otro gimnasio recibe 403 genérico (criterio 18).
  const alumnoOEntrenadorAsignado = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR'),
    requireStudentOwnership('studentId'),
    requireAssignment,
  ];

  // T1: declarar una condición con zona corporal y severidad.
  router.post(
    '/students/:studentId/conditions',
    ...soloElAlumno,
    controller.declare,
  );

  // T3: consentimiento y declaración de "ninguna" (para la pantalla).
  router.get(
    '/students/:studentId/conditions/status',
    ...alumnoOEntrenadorAsignado,
    controller.status,
  );

  // Criterio 8: declarar expresamente que no hay ninguna condición.
  router.post(
    '/students/:studentId/conditions/none',
    ...soloElAlumno,
    controller.declareNone,
  );

  // T2: historial con vigencia. `?vigentesEn=YYYY-MM-DD` responde qué regía en
  // esa fecha (RF-085).
  router.get(
    '/students/:studentId/conditions',
    ...alumnoOEntrenadorAsignado,
    controller.list,
  );

  // T2: cerrar una condición vigente.
  router.post(
    '/students/:studentId/conditions/:conditionId/close',
    ...soloElAlumno,
    controller.close,
  );

  return router;
}
