import { Router, type RequestHandler } from 'express';
import {
  requireAuth,
  requireRoles,
} from '../../../../shared/middleware/auth.middleware';
import type { ExerciseCatalogController } from './catalog.controller';

export function createExerciseCatalogRouter(
  controller: ExerciseCatalogController,
  measurementAccess: RequestHandler,
): Router {
  const router = Router();
  router.use('/catalog', requireAuth, measurementAccess);
  router.get('/catalog/taxonomies', controller.taxonomies);
  router.get('/catalog/inventory', controller.inventory);
  router.post(
    '/catalog/inventory',
    requireRoles('ADMINISTRADOR'),
    controller.updateInventory,
  );
  router.get('/catalog/exercises', controller.list);
  router.post(
    '/catalog/exercises',
    requireRoles('ENTRENADOR'),
    controller.create,
  );
  router.get('/catalog/exercises/:exerciseId', controller.find);
  router.patch(
    '/catalog/exercises/:exerciseId',
    requireRoles('ENTRENADOR'),
    controller.update,
  );
  router.post(
    '/catalog/exercises/:exerciseId/review',
    requireRoles('ADMINISTRADOR'),
    controller.review,
  );
  router.post(
    '/catalog/availability',
    requireRoles('ADMINISTRADOR'),
    controller.availability,
  );
  return router;
}
