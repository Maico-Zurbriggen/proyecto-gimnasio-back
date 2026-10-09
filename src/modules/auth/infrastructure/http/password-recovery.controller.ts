import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  ChangePasswordUseCase,
  InvalidPasswordSessionError,
  InvalidRecoveryTokenError,
  RequestPasswordRecoveryUseCase,
  ResetPasswordUseCase,
  WeakPasswordError,
} from '../../application/use-cases/password-recovery.use-cases';

const password = z.string().min(1).max(72);
const requestSchema = z
  .object({ email: z.string().trim().email().max(254) })
  .strict();
const resetSchema = z
  .object({ token: z.string().min(1).max(256), password })
  .strict();
const changeSchema = z.object({ password }).strict();

export class PasswordRecoveryController {
  constructor(
    private readonly requestRecovery: RequestPasswordRecoveryUseCase,
    private readonly resetPassword: ResetPasswordUseCase,
    private readonly changePassword: ChangePasswordUseCase,
  ) {}
  request = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request_body' });
      return;
    }
    try {
      // Express no confía en X-Forwarded-For sin un proxy configurado.
      const result = await this.requestRecovery.execute(
        parsed.data.email,
        req.ip ?? req.socket.remoteAddress ?? 'unknown',
      );
      res.status(result.limited ? 429 : 202).json(
        result.limited
          ? { error: 'recovery_rate_limited' }
          : {
              message:
                'Si la cuenta está habilitada, recibirás un enlace de recuperación.',
            },
      );
    } catch (error) {
      next(error);
    }
  };
  reset = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_recovery_request' });
      return;
    }
    try {
      await this.resetPassword.execute(parsed.data.token, parsed.data.password);
      res.status(204).end();
    } catch (error) {
      this.error(error, res, next);
    }
  };
  change = async (req: Request, res: Response, next: NextFunction) => {
    const parsed = changeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_request_body' });
      return;
    }
    try {
      await this.changePassword.execute(
        req.user?.id ?? '',
        req.user?.sessionId,
        parsed.data.password,
      );
      res.status(204).end();
    } catch (error) {
      this.error(error, res, next);
    }
  };
  private error(error: unknown, res: Response, next: NextFunction): void {
    if (error instanceof WeakPasswordError) {
      res.status(400).json({ error: 'weak_password' });
      return;
    }
    if (error instanceof InvalidRecoveryTokenError) {
      res.status(400).json({ error: 'invalid_recovery_token' });
      return;
    }
    if (error instanceof InvalidPasswordSessionError) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    next(error);
  }
}
