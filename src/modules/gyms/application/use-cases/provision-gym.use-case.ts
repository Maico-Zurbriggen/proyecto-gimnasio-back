import type { Clock } from '../../../routines/application/ports/clock';
import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
} from '../../../invitations/domain/services/invitation-validity';
import {
  GymNameTakenError,
  InvalidTimezoneError,
  InvitationDeliveryError,
} from '../../domain/errors/gym-errors';
import {
  normalizarCorreo,
  normalizarNombreGimnasio,
  tieneFormaDeZonaIana,
} from '../../domain/services/gym-provisioning';
import type { GymsRepository } from '../ports/gyms.repository';
import type { InvitationMailer } from '../../../invitations/application/ports/invitation-mailer';
import type { TimezoneCatalog } from '../ports/timezone-catalog';

export interface ProvisionGymInput {
  actorUserId: string;
  name: string;
  timezone: string;
  adminEmail: string;
}

export interface ProvisionGymOutput {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  /** A quién se envió la invitación de arranque (criterio front 6). */
  invitationSentTo: string;
  invitationExpiresAt: string;
}

/**
 * Alta de un gimnasio afiliado por el SuperAdmin (HU13 - T1, FL-00).
 *
 * Todo ocurre en una transacción: el gimnasio, la invitación de arranque del
 * primer administrador —rol ADMINISTRADOR, 14 días, marcada como emitida por el
 * aprovisionamiento—, la auditoría y el envío del correo. Si el correo no sale,
 * se deshace todo (criterio 2): un gimnasio sin la invitación de su
 * administrador sería el estado inconsistente de FL-00/E1.
 *
 * El correo del administrador puede tener cuenta en otro gimnasio: la unicidad
 * es por gimnasio (FL-00/E2), así que no se consulta.
 */
export class ProvisionGymUseCase {
  constructor(
    private readonly gyms: GymsRepository,
    private readonly timezones: TimezoneCatalog,
    private readonly mailer: InvitationMailer,
    private readonly clock: Clock,
  ) {}

  async execute(input: ProvisionGymInput): Promise<ProvisionGymOutput> {
    const timezone = input.timezone.trim();
    if (
      !tieneFormaDeZonaIana(timezone) ||
      !(await this.timezones.exists(timezone))
    ) {
      throw new InvalidTimezoneError();
    }

    const name = normalizarNombreGimnasio(input.name);
    const adminEmail = normalizarCorreo(input.adminEmail);
    const issuedAt = this.clock.now();
    const expiresAt = calcularVencimiento(issuedAt);
    const token = generarTokenDeInvitacion();

    const created = await this.gyms.provision(
      {
        name,
        timezone,
        adminEmail,
        actorUserId: input.actorUserId,
        invitation: {
          tokenHash: hashearTokenDeInvitacion(token),
          issuedAt,
          expiresAt,
        },
      },
      async (gym) => {
        try {
          await this.mailer.sendInvitation({
            to: adminEmail,
            gymName: gym.name,
            token,
            expiresAt,
            roles: ['ADMINISTRADOR'],
            trainerName: null,
          });
        } catch {
          throw new InvitationDeliveryError();
        }
      },
    );

    if (created === 'NOMBRE_DUPLICADO') {
      throw new GymNameTakenError();
    }

    return {
      id: created.id,
      name: created.name,
      timezone: created.timezone,
      createdAt: created.createdAt.toISOString(),
      invitationSentTo: created.adminEmail,
      invitationExpiresAt: created.invitationExpiresAt.toISOString(),
    };
  }
}
