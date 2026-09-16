import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { StudentsController } from './students.controller';

export function createStudentsRouter(controller: StudentsController): Router {
  const router = Router();
  // Paso 1 de la autorización: rol ENTRENADOR. Paso 2 (asignación vigente) en los casos de uso.
  const trainerOnly = [authenticate, requireAuth, requireRoles('ENTRENADOR')];

  // Cartera del entrenador autenticado.
  router.get('/trainers/me/students', ...trainerOnly, controller.listMine);

  // HU05 - T2: estado de bloqueo, motivo y fecha de la última medición.
  router.get(
    '/students/:studentId/status',
    ...trainerOnly,
    controller.getStatus,
  );

  // HU05 - T1: desbloqueo transaccional con la medición adeudada.
  router.post('/students/:studentId/unlock', ...trainerOnly, controller.unlock);

  return router;
}
