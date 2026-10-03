import type { Clock } from '../../../routines/application/ports/clock';
import type { UserRole } from '../../../../shared/types/auth';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../../domain/errors/invitation-errors';
import type { InvitationRecord } from '../ports/invitations.repository';
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface ValidatedInvitationDto {
  id: string;
  gymId: string;
  gymName: string;
  email: string;
  roles: UserRole[];
  expiresAt: string;
}

/**
 * Comprueba que una invitación siga sirviendo para completar una cuenta
 * (HU06 - T1 y T6).
 *
 * Distingue los cuatro desenlaces —inexistente, usada, revocada y caducada— con
 * un error propio cada uno, porque la pantalla tiene que decir cuál es el caso:
 * un mensaje genérico dejaría a la persona sin saber si tiene que pedir otra
 * invitación o simplemente iniciar sesión.
 */
export class ValidateInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<ValidatedInvitationDto> {
    const invitation = await resolveUsableInvitation(
      this.invitations,
      token,
      this.clock.now(),
    );

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

/**
 * Recupera la invitación y verifica que se pueda usar. Compartida con el completado
 * de la cuenta para que la validación de T1 no quede escrita dos veces: si sólo la
 * aplicara la pantalla, un `POST` directo la saltearía.
 */
export async function resolveUsableInvitation(
  invitations: InvitationsRepository,
  token: string,
  now: Date,
): Promise<InvitationRecord> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new InvitationNotFoundError();
  }

  const invitation = await invitations.findByToken(trimmed);
  if (!invitation) {
    throw new InvitationNotFoundError();
  }
  if (invitation.status === 'USADA') {
    throw new InvitationAlreadyUsedError();
  }
  if (invitation.status === 'REVOCADA') {
    throw new InvitationRevokedError();
  }
  // El estado CADUCADA lo escribe un proceso; el vencimiento por fecha se evalúa
  // igual, para no depender de que ese proceso haya corrido.
  if (invitation.status === 'CADUCADA' || invitation.expiresAt <= now) {
    throw new InvitationExpiredError();
  }

  return invitation;
}
