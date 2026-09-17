import { Router } from 'express';

import type { InvitationsController } from './invitations.controller';

export function createInvitationsRouter(
  controller: InvitationsController,
): Router {
  const router = Router();

  // HU06 - T1 & T6: Validar token de invitación
  router.get('/invitations/:token', controller.validate);

  // HU06 - T2, T3 & T4: Completar cuenta con nombre + contraseña
  router.post('/invitations/:token/complete', controller.complete);

  return router;
}
