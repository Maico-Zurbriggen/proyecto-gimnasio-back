import type { NextFunction, Request, Response } from 'express';

import type { LoginUseCase } from '../../application/use-cases/login.use-case';
import type { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { InvalidCredentialsError } from '../../domain/errors/auth-errors';
import { loginBodySchema } from './auth.schemas';
import {
  emitirCookieDeSesion,
  leerCookieDeSesion,
  limpiarCookieDeSesion,
} from './session-cookie';

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  /** HU07 - T1: inicio de sesión. */
  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const body = loginBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        // Mismo código que unas credenciales incorrectas: un cuerpo incompleto no
        // tiene por qué distinguirse de un intento fallido.
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }

      const result = await this.loginUseCase.execute({
        email: body.data.email,
        password: body.data.password,
      });

      emitirCookieDeSesion(res, result.token, result.expiresAt);

      // El token va sólo en la cookie httpOnly: nunca en el cuerpo (RNF-16).
      res.status(200).json({
        user: result.user,
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        res.status(401).json({ error: 'invalid_credentials' });
        return;
      }
      next(error);
    }
  };

  /** HU07 - T4: cierre de sesión explícito. */
  logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.logoutUseCase.execute(leerCookieDeSesion(req));
      limpiarCookieDeSesion(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  /** Identidad de la sesión en curso, para que el frontend sepa quién entró. */
  me = (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    res.status(200).json({ user: req.user });
  };
}
