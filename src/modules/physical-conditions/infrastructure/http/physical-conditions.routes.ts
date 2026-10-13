import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { PhysicalConditionsController } from './physical-conditions.controller';

export function createPhysicalConditionsRouter(
  controller: PhysicalConditionsController,
): Router {
  const router = Router();

  // HU11: el alumno declara y cierra sus condiciones; su entrenador las
  // consulta. `requireStudentOwnership` deja pasar al entrenador y rechaza al
  // alumno que mira a otro (RA-01, doble filtro).
  const propiasOAsignadas = [
    authenticate,
    requireAuth,
    requireStudentOwnership('studentId'),
  ];

  // T1: declarar una condición con zona corporal y severidad.
  router.post(
    '/students/:studentId/conditions',
    ...propiasOAsignadas,
    controller.declare,
  );

  // T2: historial con vigencia. `?vigentesEn=YYYY-MM-DD` responde qué regía en
  // esa fecha (RF-085).
  router.get(
    '/students/:studentId/conditions',
    ...propiasOAsignadas,
    controller.list,
  );

  // T2: cerrar una condición vigente.
  router.post(
    '/students/:studentId/conditions/:conditionId/close',
    ...propiasOAsignadas,
    controller.close,
  );

  return router;
}
