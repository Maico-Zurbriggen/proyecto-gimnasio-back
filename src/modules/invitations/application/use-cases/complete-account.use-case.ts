import type { Clock } from '../../../routines/application/ports/clock';
import { SystemClock } from '../../../routines/application/ports/clock';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
  WeakPasswordError,
} from '../../domain/errors/invitation-errors';
import { JwtTokenService } from '../../domain/services/jwt-token.service';
import { PasswordHasher } from '../../domain/services/password-hasher.service';
import { validatePasswordStrength } from '../../domain/services/password-strength.service';
import type {
  CompletedAccountResult,
  InvitationsRepository,
} from '../ports/invitations.repository';

export interface CompleteAccountInput {
  token: string;
  displayName: string;
  password: string;
}

export interface CompleteAccountOutput {
  token: string;
  user: {
    id: string;
    gymId: string;
    email: string;
    displayName: string;
    roles: string[];
  };
}

export class CompleteAccountUseCase {
  constructor(
    private readonly repository: InvitationsRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: CompleteAccountInput): Promise<CompleteAccountOutput> {
    const trimmedToken = input.token?.trim() ?? '';
    if (!trimmedToken) {
      throw new InvitationNotFoundError();
    }

    const invitation = await this.repository.findByToken(trimmedToken);
    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    if (invitation.status === 'USADA') {
      throw new InvitationAlreadyUsedError();
    }

    if (invitation.status === 'REVOCADA') {
      throw new InvitationRevokedError();
    }

    const now = this.clock.now();
    if (invitation.status === 'CADUCADA' || invitation.expiresAt < now) {
      throw new InvitationExpiredError();
    }

    const trimmedName = input.displayName?.trim() ?? '';
    if (trimmedName.length < 2) {
      throw new Error('El nombre para mostrar debe tener al menos 2 caracteres');
    }

    // T4 - Validación de fortaleza de contraseñas
    const passwordValidation = validatePasswordStrength(input.password);
    if (!passwordValidation.valid) {
      throw new WeakPasswordError(
        'La contraseña no cumple con los requisitos mínimos de seguridad',
        passwordValidation.errors,
      );
    }

    // T3 - Hash seguro de contraseña con Bcrypt
    const passwordHash = await PasswordHasher.hash(input.password);

    // T2 - Crear cuenta y marcar invitación como usada
    const accountResult: CompletedAccountResult =
      await this.repository.completeAccount({
        invitationId: invitation.id,
        displayName: trimmedName,
        passwordHash,
      });

    // T3 - Generar JWT seguro
    const jwtToken = JwtTokenService.sign({
      sub: accountResult.userId,
      gymId: accountResult.gymId,
      email: accountResult.email,
      displayName: accountResult.displayName,
      roles: accountResult.roles,
    });

    return {
      token: jwtToken,
      user: {
        id: accountResult.userId,
        gymId: accountResult.gymId,
        email: accountResult.email,
        displayName: accountResult.displayName,
        roles: accountResult.roles,
      },
    };
  }
}
