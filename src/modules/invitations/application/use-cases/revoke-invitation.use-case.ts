import type { AuthUser } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  ForbiddenRevocationError,
  InvitationNotFoundError,
  InvitationNotRevocableError,
} from '../../domain/errors/invitation-errors';
import { estadoEfectivo } from '../../domain/services/invitation-issuing';
import { motivoNoUsable } from '../../domain/services/invitation-validity';
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
    const estado = estadoEfectivo(
      motivoNoUsable(
        invitation.status,
        invitation.issuedAt,
        invitation.expiresAt,
        now,
      ),
    );
    if (estado !== 'VIGENTE') {
      throw new InvitationNotRevocableError(
        estado === 'USADA'
          ? 'La invitación ya se usó: la cuenta está creada'
          : estado === 'REVOCADA'
            ? 'La invitación ya estaba revocada'
            : 'La invitación ya venció',
        estado,
      );
    }
    const revoked = await this.invitations.revoke({
      invitationId,
      actorUserId: actor.id,
      now,
    });
    if (!revoked) throw new InvitationNotRevocableError();
  }
}
