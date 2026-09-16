import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { RoutinesController } from './routines.controller';

export function createRoutinesRouter(
  controller: RoutinesController,
  requireAssignment: RequestHandler,
): Router {
  const router = Router();

  // Endpoint de rutina vigente por alumno: GET /students/:studentId/routines/active
  // Autorización en tres pasos:
  // Paso 1: rol permitido (ALUMNO, ENTRENADOR, ADMINISTRADOR)
  // Paso 2: propiedad del recurso (ALUMNO solo puede consultar su propio studentId; acceso ajeno retorna 403)
  // Paso 3: asignación vigente (ENTRENADOR sólo accede a los alumnos a su cargo, RF-066)
  router.get(
    '/students/:studentId/routines/active',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR', 'ADMINISTRADOR'),
    requireStudentOwnership('studentId'),
    requireAssignment,
    controller.getActive,
  );

  // Endpoint directo de rutina vigente para el alumno actualmente autenticado: GET /routines/active
  router.get(
    '/routines/active',
    authenticate,
    requireAuth,
    requireRoles('ALUMNO'),
    controller.getActive,
  );

  return router;
}
