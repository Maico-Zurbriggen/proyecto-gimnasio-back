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
  HealthDataConsentRequiredError,
  InvalidStudentContextError,
  StudentContextNotFoundError,
  type StudentContextUseCases,
} from '../application/student-context.use-cases';
import { NIVELES_EXPERIENCIA, SEXOS } from '../domain/student-context';

const body = z.object({
  experienceLevel: z.enum(NIVELES_EXPERIENCIA, {
    message: 'Elegí tu nivel de experiencia',
  }),
  availableDaysPerWeek: z.number({ message: 'Indicá tus días disponibles' }),
  birthDate: z.iso.date({ message: 'Indicá tu fecha de nacimiento' }),
  sex: z.enum(SEXOS, { message: 'Elegí una opción' }),
  heightCm: z.number({ message: 'Indicá tu altura' }),
  weightKg: z.number({ message: 'Indicá tu peso' }),
});

function sendError(error: unknown, res: Response, next: NextFunction) {
  if (error instanceof StudentContextNotFoundError) {
    res.status(404).json({ error: 'student_profile_not_found' });
    return;
  }
  if (error instanceof HealthDataConsentRequiredError) {
    res.status(409).json({
      error: 'health_data_consent_required',
      message: error.message,
    });
    return;
  }
  if (error instanceof InvalidStudentContextError) {
    res
      .status(422)
      .json({ error: 'invalid_student_context', fields: error.fields });
    return;
  }
  next(error);
}

/** FL-01: el alumno consulta y declara su propio contexto. */
export function createStudentContextRouter(useCases: StudentContextUseCases) {
  const router = Router();
  const alumno = [requireAuth, requireRoles('ALUMNO')];

  router.get(
    '/students/me/context',
    ...alumno,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.json(await useCases.read(req.user!));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  router.put(
    '/students/me/context',
    ...alumno,
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
        res.json(await useCases.save(req.user!, parsed.data));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  // FL-19/A2: otorgar después del alta el consentimiento para datos de salud.
  router.post(
    '/students/me/health-consent',
    ...alumno,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        res.status(201).json(await useCases.grantHealthConsent(req.user!));
      } catch (error) {
        sendError(error, res, next);
      }
    },
  );

  return router;
}
