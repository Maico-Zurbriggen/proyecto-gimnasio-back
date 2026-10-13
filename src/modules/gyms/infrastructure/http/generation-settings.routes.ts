import { Router } from 'express';
import { z } from 'zod';
import {
  authenticate,
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { GenerationSettingsService } from '../../application/generation-settings.service';
import { GenerationSettingsError } from '../../domain/generation-settings';

export const generationSettingsSchema = z
  .object({
    minExercisesPerDay: z.number().int(),
    maxExercisesPerDay: z.number().int(),
    minWorkSetsPerExercise: z.number().int(),
    maxWorkSetsPerExercise: z.number().int(),
    minRepetitions: z.number().int(),
    maxRepetitions: z.number().int(),
    minRestSeconds: z.number().int(),
    maxRestSeconds: z.number().int(),
    warmupSetsPerExercise: z.number().int(),
  })
  .strict();
const bodySchema = z
  .object({
    settings: generationSettingsSchema.nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();

export function createGenerationSettingsRouter(
  service: GenerationSettingsService,
) {
  const router = Router();
  router.get(
    '/gyms/me/generation-settings',
    authenticate,
    requireAuth,
    requireRoles('ADMINISTRADOR', 'ENTRENADOR'),
    async (req, res, next) => {
      try {
        res.json(await service.get(req.user!.gymId));
      } catch (error) {
        next(error);
      }
    },
  );
  router.put(
    '/gyms/me/generation-settings',
    authenticate,
    requireAuth,
    requireRoles('ADMINISTRADOR'),
    async (req, res, next) => {
      const body = bodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'invalid_generation_settings' });
        return;
      }
      try {
        res.json(
          await service.save(
            req.user!.gymId,
            req.user!.id,
            body.data.settings,
            body.data.revision,
          ),
        );
      } catch (error) {
        if (error instanceof GenerationSettingsError)
          res.status(error.status).json({ error: error.code });
        else next(error);
      }
    },
  );
  return router;
}
