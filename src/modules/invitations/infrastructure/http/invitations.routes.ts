import { Router, type RequestHandler } from 'express';

import type { InvitationsController } from './invitations.controller';

export function createInvitationsRouter(
  controller: InvitationsController,
  limitAttempts: (scope: string) => RequestHandler,
): Router {
  const router = Router();

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
