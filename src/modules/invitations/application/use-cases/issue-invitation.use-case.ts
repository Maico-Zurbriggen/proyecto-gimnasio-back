import type { AuthUser, UserRole } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmailAlreadyRegisteredError,
  ForbiddenRoleError,
  InvitationDeliveryError,
  PendingInvitationExistsError,
} from '../../domain/errors/invitation-errors';
import {
  puedeOtorgarRoles,
  type EstadoInvitacionEmitida,
} from '../../domain/services/invitation-issuing';
import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
  motivoNoUsable,
} from '../../domain/services/invitation-validity';
import type { InvitationMailer } from '../ports/invitation-mailer';
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface IssueInvitationOutput {
  id: string;
  email: string;
  roles: UserRole[];
  expiresAt: string;
  /** Profesor que va a tener el alumno, si lo invita un entrenador. */
  trainerName: string | null;
}

/**
 * Emisión de una invitación nominal (FL-19/1-2).
 *
 * El gimnasio sale del emisor, nunca del pedido, y los roles se validan en el
 * servidor: un entrenador sólo invita alumnos, que quedarán asignados a él al
 * completar la cuenta (HU06). El enlace lleva un token aleatorio que sólo viaja
 * en el correo; en la base queda su hash.
 */
export class IssueInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly mailer: InvitationMailer,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actor: AuthUser;
    email: string;
    roles: UserRole[];
  }): Promise<IssueInvitationOutput> {
    const roles = [...new Set(input.roles)];
    if (!puedeOtorgarRoles(input.actor.roles, roles)) {
      throw new ForbiddenRoleError();
    }

    const issuedAt = this.clock.now();
    const expiresAt = calcularVencimiento(issuedAt);
    const token = generarTokenDeInvitacion();

    const issued = await this.invitations.issue(
      {
        gymId: input.actor.gymId,
        issuedByUserId: input.actor.id,
        emailNormalized: input.email.trim().toLowerCase(),
        roles,
        tokenHash: hashearTokenDeInvitacion(token),
        issuedAt,
        expiresAt,
      },
      async (created) => {
        try {
          await this.mailer.sendInvitation({
            to: created.emailNormalized,
            gymName: created.gymName,
            token,
            expiresAt,
            roles: created.roles,
            trainerName: created.roles.includes('ALUMNO')
              ? created.trainerName
              : null,
          });
        } catch {
          throw new InvitationDeliveryError();
        }
      },
    );

    if (issued === 'EMAIL_YA_REGISTRADO') {
      throw new EmailAlreadyRegisteredError();
    }
    if (issued === 'INVITACION_VIGENTE_EXISTENTE') {
      throw new PendingInvitationExistsError();
    }

    return {
      id: issued.id,
      email: issued.emailNormalized,
      roles: issued.roles,
      expiresAt: issued.expiresAt.toISOString(),
      trainerName: issued.roles.includes('ALUMNO') ? issued.trainerName : null,
    };
  }
}

export interface ListedInvitationDto {
  id: string;
  email: string;
  roles: UserRole[];
  status: EstadoInvitacionEmitida;
  issuedAt: string;
  expiresAt: string;
  issuedByName: string | null;
}

/**
 * Invitaciones emitidas: el administrador ve las de todo su gimnasio; el
 * entrenador, sólo las suyas (RA-02).
 */
export class ListInvitationsUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(actor: AuthUser): Promise<ListedInvitationDto[]> {
    const now = this.clock.now();
    const records = await this.invitations.list({
      gymId: actor.gymId,
      issuedByUserId: actor.roles.includes('ADMINISTRADOR')
        ? undefined
        : actor.id,
    });
    return records.map((record) => ({
      id: record.id,
      email: record.emailNormalized,
      roles: record.roles,
      status:
        motivoNoUsable(record.status, record.issuedAt, record.expiresAt, now) ??
        'PENDIENTE',
      issuedAt: record.issuedAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      issuedByName: record.issuedByName,
    }));
  }
}
