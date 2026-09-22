import type { NextFunction, Request, Response } from 'express';

import { InvalidSessionError } from '../../domain/errors/auth-errors';
import type { GetSessionUseCase } from '../../application/use-cases/get-session.use-case';
import { readSessionCookie } from './session-cookie';

/**
 * Resuelve la sesión de la cookie hacia `req.user` antes de los routers. Sin
 * cookie no toca la base; con sesión inválida deja pasar sin usuario y las
 * rutas protegidas responden 401. Los headers `x-user-*` siguen disponibles
 * como fallback de desarrollo y tests.
 */
export function createSessionMiddleware(getSessionUseCase: GetSessionUseCase) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.user) {
      const sessionToken = readSessionCookie(req);
      if (sessionToken) {
        try {
          req.user = await getSessionUseCase.execute({ sessionToken });
        } catch (error) {
          if (!(error instanceof InvalidSessionError)) {
            next(error);
            return;
          }
        }
      }
    }
    next();
  };
}
