import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../../../shared/middleware/auth.middleware';

export function createCatalogMediaRouter(
  prisma: PrismaClient,
  directory: string,
): Router {
  const router = Router();
  router.get(
    '/catalog/media/:revision/:filename',
    requireAuth,
    async (req, res, next) => {
      const { revision, filename } = req.params;
      if (
        typeof revision !== 'string' ||
        typeof filename !== 'string' ||
        !/^[a-f0-9]{64}$/.test(revision) ||
        !/^[a-z0-9-]+\.webp$/.test(filename)
      ) {
        res.sendStatus(404);
        return;
      }
      const url = `/catalog/media/${revision}/${filename}`;
      try {
        const media = await prisma.exerciseMedia.findFirst({
          where: {
            url,
            exercise: {
              state: 'APROBADO',
              source: 'RepDB',
              origin: 'CATALOGO_BASE',
              gymId: null,
            },
          },
          select: { id: true },
        });
        if (!media) {
          res.sendStatus(404);
          return;
        }
        const root = resolve(directory);
        const path = resolve(root, revision!, filename!);
        if (!path.startsWith(root + sep)) {
          res.sendStatus(404);
          return;
        }
        await stat(path);
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.type('image/webp').sendFile(path);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          res.sendStatus(404);
          return;
        }
        next(error);
      }
    },
  );
  return router;
}
