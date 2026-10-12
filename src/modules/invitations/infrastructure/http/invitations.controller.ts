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

/**
 * Traduce los errores del alta a HTTP. Los tres motivos de invitación no usable
 * llevan su `code` (VENCIDA, REVOCADA, USADA); la inexistente responde lo mismo
 * para un token alterado que para uno que nunca existió (criterio 3).
 *
 * Ninguna respuesta repite la contraseña ni el token (RNF-19).
 */
function sendInvitationError(
  error: unknown,
  res: Response,
  next: NextFunction,
): void {
  if (error instanceof InvitationNotFoundError) {
    res.status(404).json({
      error: 'invitation_not_found',
      code: error.code,
      message: error.message,
    });
    return;
  }
  if (error instanceof InvitationAlreadyUsedError) {
    res.status(409).json({
      error: 'invitation_already_used',
      code: error.code,
      message: error.message,
    });
    return;
  }
  if (error instanceof InvitationRevokedError) {
    res.status(410).json({
      error: 'invitation_revoked',
      code: error.code,
      message: error.message,
    });
    return;
  }
  if (error instanceof InvitationExpiredError) {
    res.status(410).json({
      error: 'invitation_expired',
      code: error.code,
      message: error.message,
    });
    return;
  }
  if (error instanceof WeakPasswordError) {
    res.status(422).json({
      error: 'weak_password',
      message: error.message,
      details: error.validationErrors,
      fields: { password: error.validationErrors },
    });
    return;
  }
  if (error instanceof InvalidDisplayNameError) {
    res.status(422).json({
      error: 'invalid_display_name',
      message: error.message,
      fields: { displayName: [error.message] },
    });
    return;
  }
  if (error instanceof UserAlreadyExistsError) {
    res.status(409).json({
      error: 'user_already_exists',
      code: error.code,
      message: error.message,
    });
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
        throw new InvitationNotFoundError();
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
        throw new InvitationNotFoundError();
      }

      const body = completeAccountBodySchema.safeParse(req.body ?? {});
      if (!body.success) {
        // Criterio 13: un error por campo, para mostrarlo junto a cada input.
        res.status(400).json({
          error: 'invalid_request_body',
          fields: body.error.flatten().fieldErrors,
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
