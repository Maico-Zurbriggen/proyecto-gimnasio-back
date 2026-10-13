import type { AuthUser } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  ForbiddenRevocationError,
  InvitationNotFoundError,
  InvitationNotRevocableError,
} from '../../domain/errors/invitation-errors';
import type { InvitationsRepository } from '../ports/invitations.repository';

export class RevokeInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(actor: AuthUser, invitationId: string): Promise<void> {
    const invitation = await this.invitations.findIssuedById(
      invitationId,
      actor.gymId,
    );
    if (!invitation) throw new InvitationNotFoundError();

    const canRevoke =
      actor.roles.includes('ADMINISTRADOR') ||
      invitation.issuedByUserId === actor.id;
    if (!canRevoke) throw new ForbiddenRevocationError();

    const now = this.clock.now();
    if (invitation.status !== 'VIGENTE' || invitation.expiresAt <= now) {
      throw new InvitationNotRevocableError();
    }
    const revoked = await this.invitations.revoke({
      invitationId,
      actorUserId: actor.id,
      now,
    });
    if (!revoked) throw new InvitationNotRevocableError();
  }
}
