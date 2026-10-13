import type { Clock } from '../../../routines/application/ports/clock';
import { TEXTO_CONSENTIMIENTO_DATOS_SALUD } from '../../../student-context/domain/health-consent';
import type { UserRole } from '../../../../shared/types/auth';
import {
  InvitationAlreadyUsedError,
  InvitationExpiredError,
  InvitationNotFoundError,
  InvitationRevokedError,
} from '../../domain/errors/invitation-errors';
import {
  hashearTokenDeInvitacion,
  motivoNoUsable,
  vencimientoEfectivo,
} from '../../domain/services/invitation-validity';
import type {
  InvitationRecord,
  InvitationsRepository,
} from '../ports/invitations.repository';

/**
 * Lo que la pantalla de alta necesita mostrar. No incluye identificadores
 * internos: el enlace es la única credencial y no hace falta exponer más.
 */
export interface ValidatedInvitationDto {
  gymName: string;
  email: string;
  roles: UserRole[];
  expiresAt: string;
  /** Profesor que va a tener el alumno, si lo invitó un entrenador. */
  trainerName: string | null;
  /** Texto del consentimiento de datos de salud, si se invita a un alumno. */
  healthConsentText: string | null;
}

/** Largo máximo razonable de un token; uno más largo ni se consulta. */
const LARGO_MAXIMO_TOKEN = 256;

/**
 * Comprueba que una invitación siga sirviendo para completar una cuenta
 * (HU06 - T1 y T6).
 *
 * Distingue los desenlaces —inválida, usada, revocada y vencida— con un error
 * propio cada uno, porque la pantalla tiene que decir cuál es el caso.
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
      gymName: invitation.gymName,
      email: invitation.emailNormalized,
      roles: invitation.roles,
      expiresAt: vencimientoEfectivo(
        invitation.issuedAt,
        invitation.expiresAt,
      ).toISOString(),
      trainerName: invitation.trainerName,
      healthConsentText: invitation.roles.includes('ALUMNO')
        ? TEXTO_CONSENTIMIENTO_DATOS_SALUD
        : null,
    };
  }
}

/** Traduce el motivo del dominio al error que lo representa. */
export function errorPorMotivo(
  motivo: 'USADA' | 'REVOCADA' | 'VENCIDA',
): Error {
  switch (motivo) {
    case 'USADA':
      return new InvitationAlreadyUsedError();
    case 'REVOCADA':
      return new InvitationRevokedError();
    case 'VENCIDA':
      return new InvitationExpiredError();
  }
}

/**
 * Recupera la invitación por el hash del token y verifica que se pueda usar.
 * Compartida con el completado de la cuenta para que la validación de T1 no
 * quede escrita dos veces: si sólo la aplicara la pantalla, un `POST` directo la
 * saltearía (criterio 5).
 */
export async function resolveUsableInvitation(
  invitations: InvitationsRepository,
  token: string,
  now: Date,
): Promise<InvitationRecord> {
  const trimmed = token.trim();
  if (trimmed.length === 0 || trimmed.length > LARGO_MAXIMO_TOKEN) {
    throw new InvitationNotFoundError();
  }

  const invitation = await invitations.findByTokenHash(
    hashearTokenDeInvitacion(trimmed),
  );
  if (!invitation) {
    throw new InvitationNotFoundError();
  }

  const motivo = motivoNoUsable(
    invitation.status,
    invitation.issuedAt,
    invitation.expiresAt,
    now,
  );
  if (motivo) {
    throw errorPorMotivo(motivo);
  }

  return invitation;
}
