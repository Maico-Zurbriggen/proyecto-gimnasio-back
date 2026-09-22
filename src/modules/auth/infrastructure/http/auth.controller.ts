import type { NextFunction, Request, Response } from 'express';

import {
  InvalidCredentialsError,
  InvalidSessionError,
} from '../../domain/errors/auth-errors';
import type { GetSessionUseCase } from '../../application/use-cases/get-session.use-case';
import type { LoginUseCase } from '../../application/use-cases/login.use-case';
import type { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { loginBodySchema } from './auth.schemas';
import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from './session-cookie';

export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly getSessionUseCase: GetSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
  ) {}

  login = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const parsedBody = loginBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: parsedBody.error.flatten(),
        });
        return;
      }

      const result = await this.loginUseCase.execute({
        email: parsedBody.data.email,
        password: parsedBody.data.password,
      });

      setSessionCookie(res, result.sessionToken, result.expiresAt);
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

  me = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sessionToken = readSessionCookie(req);
      if (!sessionToken) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      const user = await this.getSessionUseCase.execute({ sessionToken });

      res.status(200).json({ user });
    } catch (error) {
      if (error instanceof InvalidSessionError) {
        res.status(401).json({ error: 'unauthorized' });
        return;
      }

      next(error);
    }
  };

  logout = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.logoutUseCase.execute({
        sessionToken: readSessionCookie(req),
      });
      clearSessionCookie(res);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
