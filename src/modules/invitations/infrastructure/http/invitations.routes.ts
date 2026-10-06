import { Router } from 'express';

import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { InvitationsController } from './invitations.controller';

export function createInvitationsRouter(
  controller: InvitationsController,
): Router {
  const router = Router();

  // HU08: emitir, revocar y listar exigen sesión y un rol que pueda invitar
  // (criterios 3 y 4). Qué roles puede otorgar cada emisor lo decide el
  // dominio, no la ruta (criterio 2).
  const puedenInvitar = [
    authenticate,
    requireAuth,
    requireRoles('ADMINISTRADOR', 'ENTRENADOR'),
  ];

  // HU08 - T1 y T4: emisión de una invitación nominal.
  router.post('/invitations', ...puedenInvitar, controller.issue);

  // HU08 - T3: listado del gimnasio, acotado al emisor si no es administrador.
  router.get('/invitations', ...puedenInvitar, controller.list);

  // HU08 - T2: revocación.
  router.post(
    '/invitations/:invitationId/revoke',
    ...puedenInvitar,
    controller.revoke,
  );

  // Las dos rutas siguientes son públicas por definición: quien las usa todavía
  // no tiene cuenta. La invitación misma es la credencial (RF-116).

  // HU06 - T1 y T6: estado de la invitación.
  router.get('/invitations/:token', controller.validate);

  // HU06 - T2, T3 y T4: completar la cuenta con nombre y contraseña.
  router.post('/invitations/:token/complete', controller.complete);

  return router;
}
