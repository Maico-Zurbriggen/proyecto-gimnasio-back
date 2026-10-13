import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';

import {
  requireAuth,
  requireRoles,
} from '../../../shared/middleware/auth.middleware';
import {
  UnknownEquipmentError,
  type InventoryUseCases,
} from '../application/inventory';

const body = z.object({
  present: z.array(z.string(), { message: 'Indicá el equipamiento presente' }),
});

function sendError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof UnknownEquipmentError) {
    res.status(422).json({
      error: 'unknown_equipment',
      message: error.message,
      fields: { present: [error.message] },
    });
    return;
  }
  next(error);
}

/**
 * Inventario del gimnasio (FL-20) y primeros pasos (CB-59). Sólo el
 * administrador, y siempre sobre el gimnasio de su sesión.
 */
export function createInventoryRouter(useCases: InventoryUseCases) {
  const router = Router();
  const admin = [requireAuth, requireRoles('ADMINISTRADOR')];

  router.get(
    '/admin/inventory',
    ...admin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await useCases.read(req.user!));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  router.put(
    '/admin/inventory',
    ...admin,
    async (req: Request, res: Response, next: NextFunction) => {
      const parsed = body.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          fields: parsed.error.flatten().fieldErrors,
        });
        return;
      }
      try {
        res.json(await useCases.save(req.user!, parsed.data.present));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  router.get(
    '/admin/setup',
    ...admin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await useCases.setup(req.user!));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
