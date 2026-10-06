import type { UserRole } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  ForbiddenRevocationError,
  InvitationNotFoundError,
  InvitationNotRevocableError,
} from '../../domain/errors/invitation-errors';
import {
  estadoEfectivo,
  puedeRevocarInvitacion,
  puedeRevocarse,
} from '../../domain/services/invitation-issuing';
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface RevokeInvitationInput {
  actor: { id: string; gymId: string; roles: UserRole[] };
  invitationId: string;
}

/**
 * Revocación de una invitación (HU08 - T2).
 *
 * La búsqueda está acotada al gimnasio del actor: una invitación de otro
 * gimnasio responde «no existe», sin revelar si existe (criterio 16, RNF-14).
 */
export class RevokeInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: RevokeInvitationInput): Promise<void> {
    const invitation = await this.invitations.findById(
      input.invitationId,
      input.actor.gymId,
    );

    if (!invitation) {
      throw new InvitationNotFoundError();
    }

    if (!puedeRevocarInvitacion(input.actor, invitation)) {
      throw new ForbiddenRevocationError();
    }

    const now = this.clock.now();
    if (!puedeRevocarse(invitation.status, invitation.expiresAt, now)) {
      throw new InvitationNotRevocableError(
        'Sólo puede revocarse una invitación vigente',
        estadoEfectivo(invitation.status, invitation.expiresAt, now),
      );
    }

    await this.invitations.revoke(invitation.id);

    await this.invitations.recordAudit({
      actorUserId: input.actor.id,
      operation: 'REVOCACION_INVITACION',
      invitationId: invitation.id,
      newValue: { estado: 'REVOCADA' },
    });
  }
}
