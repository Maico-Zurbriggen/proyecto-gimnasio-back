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
  InvalidTrainerError,
  SelfAssignmentError,
  StudentNotInGymError,
  type AssignmentsUseCases,
} from '../application/assignments';

const params = z.object({ studentId: z.string().uuid() });
const body = z.object({
  trainerId: z
    .string({ message: 'Elegí un entrenador' })
    .uuid('Elegí un entrenador'),
});

function sendError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof StudentNotInGymError) {
    res
      .status(404)
      .json({ error: 'student_not_found', message: error.message });
    return;
  }
  if (
    error instanceof InvalidTrainerError ||
    error instanceof SelfAssignmentError
  ) {
    res.status(422).json({
      error: 'invalid_trainer',
      message: error.message,
      fields: { trainerId: [error.message] },
    });
    return;
  }
  next(error);
}

/**
 * Panel de asignaciones del administrador (RF-066). El gimnasio sale de la
 * sesión: un administrador nunca ve ni toca alumnos de otro gimnasio.
 */
export function createAssignmentsRouter(useCases: AssignmentsUseCases) {
  const router = Router();
  const admin = [requireAuth, requireRoles('ADMINISTRADOR')];

  router.get(
    '/admin/assignments',
    ...admin,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await useCases.overview(req.user!));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  router.put(
    '/admin/students/:studentId/trainer',
    ...admin,
    async (req: Request, res: Response, next: NextFunction) => {
      const parsedParams = params.safeParse(req.params);
      if (!parsedParams.success) {
        res.status(404).json({ error: 'student_not_found' });
        return;
      }
      const parsedBody = body.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          fields: parsedBody.error.flatten().fieldErrors,
        });
        return;
      }
      try {
        res.json(
          await useCases.assign(
            req.user!,
            parsedParams.data.studentId,
            parsedBody.data.trainerId,
          ),
        );
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
