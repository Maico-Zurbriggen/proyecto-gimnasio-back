import type { AuthUser, UserRole } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmailAlreadyRegisteredError,
  ForbiddenRevocationError,
  ForbiddenRoleError,
  InvitationNotFoundError,
  InvitationNotRevocableError,
  PendingInvitationExistsError,
} from '../../domain/errors/invitation-errors';
import {
  estadoEfectivo,
  puedeOtorgarRoles,
  type EstadoInvitacionEmitida,
} from '../../domain/services/invitation-issuing';
import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
  motivoNoUsable,
} from '../../domain/services/invitation-validity';
import type {
  InvitationEmail,
  InvitationMailer,
} from '../ports/invitation-mailer';

/** Envía el correo y responde si salió, sin propagar el error del proveedor. */
async function enviarSinFallar(
  mailer: InvitationMailer,
  email: InvitationEmail,
): Promise<boolean> {
  try {
    await mailer.sendInvitation(email);
    return true;
  } catch {
    return false;
  }
}
import type { InvitationsRepository } from '../ports/invitations.repository';

export interface IssueInvitationOutput {
  id: string;
  email: string;
  roles: UserRole[];
  status: EstadoInvitacionEmitida;
  issuedAt: string;
  expiresAt: string;
  /** Criterio 18: el correo no salió; la invitación sigue VIGENTE. */
  emailFailed: boolean;
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
      // HU08 - criterio 18: el envío va después de confirmar. Si falla, la
      // invitación queda VIGENTE y se puede reenviar (que rota el token) o
      // revocar; el emisor recibe el aviso en `emailFailed`.
      () => Promise.resolve(),
    );

    if (issued === 'EMAIL_YA_REGISTRADO') {
      throw new EmailAlreadyRegisteredError();
    }
    if (issued === 'INVITACION_VIGENTE_EXISTENTE') {
      throw new PendingInvitationExistsError();
    }

    const trainerName = issued.roles.includes('ALUMNO')
      ? issued.trainerName
      : null;
    const emailFailed = !(await enviarSinFallar(this.mailer, {
      to: issued.emailNormalized,
      gymName: issued.gymName,
      token,
      expiresAt,
      roles: issued.roles,
      trainerName,
    }));

    return {
      id: issued.id,
      email: issued.emailNormalized,
      roles: issued.roles,
      status: 'VIGENTE',
      issuedAt: issuedAt.toISOString(),
      expiresAt: issued.expiresAt.toISOString(),
      trainerName,
      emailFailed,
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
      status: estadoEfectivo(
        motivoNoUsable(record.status, record.issuedAt, record.expiresAt, now),
      ),
      issuedAt: record.issuedAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      issuedByName: record.issuedByName,
    }));
  }
}

/**
 * Reenvío de una invitación vigente (HU08 - criterios 18 y 19). Rota el token:
 * el enlace anterior deja de funcionar, así que nunca hay dos activos para la
 * misma invitación. Pueden reenviar el administrador o quien la emitió.
 */
export class ResendInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly mailer: InvitationMailer,
    private readonly clock: Clock,
  ) {}

  async execute(
    actor: AuthUser,
    invitationId: string,
  ): Promise<{ emailFailed: boolean; expiresAt: string }> {
    const invitation = await this.invitations.findIssuedById(
      invitationId,
      actor.gymId,
    );
    if (!invitation) throw new InvitationNotFoundError();
    if (
      !actor.roles.includes('ADMINISTRADOR') &&
      invitation.issuedByUserId !== actor.id
    ) {
      throw new ForbiddenRevocationError(
        'No podés reenviar una invitación que no emitiste',
      );
    }
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
        'Sólo se puede reenviar una invitación vigente',
        estado,
      );
    }

    const token = generarTokenDeInvitacion();
    const rotated = await this.invitations.rotateToken({
      invitationId,
      tokenHash: hashearTokenDeInvitacion(token),
      actorUserId: actor.id,
      now,
    });
    if (!rotated) {
      throw new InvitationNotRevocableError(
        'Sólo se puede reenviar una invitación vigente',
      );
    }

    const emailFailed = !(await enviarSinFallar(this.mailer, {
      to: rotated.emailNormalized,
      gymName: rotated.gymName,
      token,
      expiresAt: rotated.expiresAt,
      roles: rotated.roles,
      trainerName: rotated.roles.includes('ALUMNO')
        ? rotated.trainerName
        : null,
    }));
    return { emailFailed, expiresAt: rotated.expiresAt.toISOString() };
  }
}
