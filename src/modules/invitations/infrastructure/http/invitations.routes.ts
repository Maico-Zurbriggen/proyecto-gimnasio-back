import { Router, type RequestHandler } from 'express';

import {
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';

import type { InvitationsController } from './invitations.controller';

export function createInvitationsRouter(
  controller: InvitationsController,
  limitAttempts: (scope: string) => RequestHandler,
): Router {
  const router = Router();

  // FL-19: emitir y listar exige sesión de administrador o entrenador. Qué
  // roles puede otorgar cada uno lo decide el dominio, no la ruta.
  const emisores = [requireAuth, requireRoles('ADMINISTRADOR', 'ENTRENADOR')];
  router.post('/invitations', ...emisores, controller.issue);
  router.get('/invitations', ...emisores, controller.list);

  // Las dos rutas son públicas por definición: quien las usa todavía no tiene
  // cuenta. La invitación misma es la credencial (RF-116), y por eso los
  // intentos desde un mismo origen están limitados (RNF-17).

  // HU06 - T1 y T6: estado de la invitación.
  router.get(
    '/invitations/:token',
    limitAttempts('invitation-validate'),
    controller.validate,
  );

  // HU06 - T2, T3 y T4: completar la cuenta con nombre y contraseña.
  router.post(
    '/invitations/:token/complete',
    limitAttempts('invitation-complete'),
    controller.complete,
  );

  return router;
}
