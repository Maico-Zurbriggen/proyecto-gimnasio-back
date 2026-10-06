import type { UserRole } from '../../../../shared/types/auth';
import type { Clock } from '../../../routines/application/ports/clock';
import {
  EmailAlreadyRegisteredError,
  ForbiddenRoleError,
  PendingInvitationExistsError,
} from '../../domain/errors/invitation-errors';
import {
  calcularVencimiento,
  normalizarCorreo,
  puedeOtorgarRoles,
} from '../../domain/services/invitation-issuing';
import type { EmailSender } from '../ports/email-sender.port';
import type {
  InvitationsRepository,
  IssuedInvitationRecord,
} from '../ports/invitations.repository';

export interface IssueInvitationInput {
  actor: { id: string; gymId: string; roles: UserRole[] };
  email: string;
  roles: UserRole[];
  gymName: string;
}

export interface IssueInvitationResult {
  invitation: IssuedInvitationRecord;
  /** `true` cuando el correo no pudo enviarse (criterio 18). */
  emailFailed: boolean;
}

/** Construye el enlace del alta (HU06) a partir del token de la invitación. */
function buildInvitationUrl(token: string): string {
  const base = (process.env.APP_PUBLIC_URL ?? 'http://localhost:5173').replace(
    /\/+$/,
    '',
  );
  return `${base}/invitacion/${token}`;
}

/**
 * Emisión de una invitación nominal (HU08 - T1 y T4).
 *
 * El gimnasio sale **del emisor**, nunca del cuerpo de la petición (criterio 5),
 * y los roles se verifican del lado del servidor aunque la interfaz ya los
 * limite: el criterio 2 exige el rechazo incluso si se fuerza el request.
 *
 * Si el envío del correo falla, la invitación **queda emitida igual** y se
 * informa el fallo (criterio 18, CB-69): el alta no depende de un único envío.
 */
export class IssueInvitationUseCase {
  constructor(
    private readonly invitations: InvitationsRepository,
    private readonly clock: Clock,
    private readonly emailSender: EmailSender | null,
  ) {}

  async execute(input: IssueInvitationInput): Promise<IssueInvitationResult> {
    if (!puedeOtorgarRoles(input.actor.roles, input.roles)) {
      throw new ForbiddenRoleError();
    }

    const emailNormalized = normalizarCorreo(input.email);
    const now = this.clock.now();

    const created = await this.invitations.create({
      gymId: input.actor.gymId,
      issuedByUserId: input.actor.id,
      emailNormalized,
      roles: input.roles,
      expiresAt: calcularVencimiento(now),
    });

    if (created === 'EMAIL_YA_REGISTRADO') {
      throw new EmailAlreadyRegisteredError();
    }
    if (created === 'INVITACION_VIGENTE_EXISTENTE') {
      throw new PendingInvitationExistsError();
    }

    await this.invitations.recordAudit({
      actorUserId: input.actor.id,
      operation: 'EMISION_INVITACION',
      invitationId: created.id,
      newValue: {
        email: emailNormalized,
        roles: input.roles,
        venceEl: created.expiresAt.toISOString(),
      },
    });

    let emailFailed = false;
    if (this.emailSender) {
      try {
        await this.emailSender.sendInvitation({
          to: emailNormalized,
          gymName: input.gymName,
          invitationUrl: buildInvitationUrl(created.id),
          expiresAt: created.expiresAt,
        });
      } catch {
        // La invitación ya existe y sigue VIGENTE: se puede reenviar o revocar.
        emailFailed = true;
      }
    } else {
      emailFailed = true;
    }

    return { invitation: created, emailFailed };
  }
}
