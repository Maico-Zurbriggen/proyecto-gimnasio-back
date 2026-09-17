import type { Clock } from '../../../routines/application/ports/clock';
import { SystemClock } from '../../../routines/application/ports/clock';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../../domain/errors/invitation-errors';
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface ValidatedInvitationDto {
  id: string;
  gymId: string;
  gymName: string;
  email: string;
  roles: string[];
  expiresAt: string;
}

export class ValidateInvitationUseCase {
  constructor(
    private readonly repository: InvitationsRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(token: string): Promise<ValidatedInvitationDto> {
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      throw new InvitationNotFoundError();
    }

    const invitation = await this.repository.findByToken(token.trim());
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

    return {
      id: invitation.id,
      gymId: invitation.gymId,
      gymName: invitation.gymName,
      email: invitation.emailNormalized,
      roles: invitation.roles,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }
}
