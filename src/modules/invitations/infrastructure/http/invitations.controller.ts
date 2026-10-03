import type { NextFunction, Request, Response } from 'express';

import { emitirCookieDeSesion } from '../../../auth/infrastructure/http/session-cookie';
import type { CompleteAccountUseCase } from '../../application/use-cases/complete-account.use-case';
import type { ValidateInvitationUseCase } from '../../application/use-cases/validate-invitation.use-case';
import {
  InvalidDisplayNameError,
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  UserAlreadyExistsError,
  WeakPasswordError,
} from '../../domain/errors/invitation-errors';
import {
  completeAccountBodySchema,
  invitationTokenParamSchema,
} from './invitations.schemas';

function sendInvitationError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof InvitationNotFoundError) {
    res
      .status(404)
      .json({ error: 'invitation_not_found', message: error.message });
    return;
  }
  if (error instanceof InvitationAlreadyUsedError) {
    res
      .status(409)
      .json({ error: 'invitation_already_used', message: error.message });
    return;
  }
  if (error instanceof InvitationRevokedError) {
    res
      .status(410)
      .json({ error: 'invitation_revoked', message: error.message });
    return;
  }
  if (error instanceof InvitationExpiredError) {
    res
      .status(410)
      .json({ error: 'invitation_expired', message: error.message });
    return;
  }
  if (error instanceof WeakPasswordError) {
    res.status(422).json({
      error: 'weak_password',
      message: error.message,
      details: error.validationErrors,
    });
    return;
  }
  if (error instanceof InvalidDisplayNameError) {
    res
      .status(422)
      .json({ error: 'invalid_display_name', message: error.message });
    return;
  }
  if (error instanceof UserAlreadyExistsError) {
    res
      .status(409)
      .json({ error: 'user_already_exists', message: error.message });
    return;
  }
  next(error);
}

export class InvitationsController {
  constructor(
    private readonly validateInvitation: ValidateInvitationUseCase,
    private readonly completeAccount: CompleteAccountUseCase,
  ) {}

  /** HU06 - T1 y T6: estado de la invitación antes de mostrar el formulario. */
  validate = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = invitationTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const invitation = await this.validateInvitation.execute(
        params.data.token,
      );
      res.status(200).json(invitation);
    } catch (error) {
      sendInvitationError(error, res, next);
    }
  };

  /** HU06 - T2, T3 y T4: alta de la cuenta y apertura de la sesión. */
  complete = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const params = invitationTokenParamSchema.safeParse(req.params);
      if (!params.success) {
        res.status(400).json({
          error: 'invalid_request_parameters',
          details: params.error.flatten(),
        });
        return;
      }

      const body = completeAccountBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({
          error: 'invalid_request_body',
          details: body.error.flatten(),
        });
        return;
      }

      const result = await this.completeAccount.execute({
        token: params.data.token,
        displayName: body.data.displayName,
        password: body.data.password,
      });

      emitirCookieDeSesion(res, result.token, result.expiresAt);

      // Igual que el login: el token va sólo en la cookie httpOnly (RNF-16).
      res.status(201).json({
        user: result.user,
        expiresAt: result.expiresAt.toISOString(),
      });
    } catch (error) {
      sendInvitationError(error, res, next);
    }
  };
}
