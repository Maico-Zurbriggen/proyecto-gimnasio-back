import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { ProposalsController } from './proposals.controller';

export function createProposalsRouter(controller: ProposalsController): Router {
  const router = Router();
  // Paso 1 de la autorización: rol ENTRENADOR. Paso 2 (asignación vigente) en los casos de uso.
  const trainerOnly = [authenticate, requireAuth, requireRoles('ENTRENADOR')];

  // Propuestas pendientes de los alumnos a cargo.
  router.get('/trainers/me/proposals', ...trainerOnly, controller.listMine);

  // HU04 - T1: payload de revisión con la advertencia de datos desactualizados.
  router.get('/proposals/:proposalId', ...trainerOnly, controller.getReview);

  // HU04 - T3: aceptación total, parcial o rechazo.
  router.post(
    '/proposals/:proposalId/resolution',
    ...trainerOnly,
    controller.resolve,
  );

  return router;
}
