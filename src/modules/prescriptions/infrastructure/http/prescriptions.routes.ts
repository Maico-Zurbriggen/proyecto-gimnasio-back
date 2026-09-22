import { Router, type RequestHandler } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
  requireStudentOwnership,
} from '../../../../shared/middleware/auth.middleware';
import type { PrescriptionsController } from './prescriptions.controller';

export function createPrescriptionsRouter(
  controller: PrescriptionsController,
  requireAssignment: RequestHandler,
): Router {
  const router = Router();

  // Escritura: sólo el entrenador, y sólo sobre sus alumnos asignados (RF-066).
  const entrenadorAsignado = [
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
    requireAssignment,
  ];

  // Lectura: el propio alumno, o el entrenador con asignación vigente.
  const alumnoOEntrenador = [
    authenticate,
    requireAuth,
    requireRoles('ALUMNO', 'ENTRENADOR'),
    requireStudentOwnership('studentId'),
    requireAssignment,
  ];

  // Plantillas del gimnasio del entrenador, para elegir cuál asignar.
  router.get(
    '/routine-templates',
    authenticate,
    requireAuth,
    requireRoles('ENTRENADOR'),
    controller.templates,
  );

  // Asignación: copia la plantilla y deja la rutina en PROPUESTA.
  router.post(
    '/students/:studentId/routines',
    ...entrenadorAsignado,
    controller.assign,
  );

  // Revisión: aprobar o rechazar la propuesta (RF-110).
  router.post(
    '/students/:studentId/routines/:routineId/review',
    ...entrenadorAsignado,
    controller.review,
  );

  // Listado de rutinas del alumno.
  router.get(
    '/students/:studentId/routines',
    ...alumnoOEntrenador,
    controller.list,
  );

  // Contenido de una rutina: días, ejercicios y series.
  // Se registra después de `/routines/active` del módulo de rutinas, que es una
  // ruta fija y por lo tanto gana el match antes que este parámetro.
  router.get(
    '/students/:studentId/routines/:routineId',
    ...alumnoOEntrenador,
    controller.content,
  );

  return router;
}
