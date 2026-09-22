import { Router } from 'express';

import type { InvitationsController } from './invitations.controller';

export function createInvitationsRouter(
  controller: InvitationsController,
): Router {
  const router = Router();

  // Las dos rutas son públicas por definición: quien las usa todavía no tiene
  // cuenta. La invitación misma es la credencial (RF-116).

  // HU06 - T1 y T6: estado de la invitación.
  router.get('/invitations/:token', controller.validate);

  // HU06 - T2, T3 y T4: completar la cuenta con nombre y contraseña.
  router.post('/invitations/:token/complete', controller.complete);

  return router;
}
