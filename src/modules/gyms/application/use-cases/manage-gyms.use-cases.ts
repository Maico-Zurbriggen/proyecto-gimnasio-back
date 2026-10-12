import type { Clock } from '../../../routines/application/ports/clock';
import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
} from '../../../invitations/domain/services/invitation-validity';
import {
  BootstrapInvitationAlreadyUsedError,
  GymNotFoundError,
  InvitationDeliveryError,
} from '../../domain/errors/gym-errors';
import {
  estadoInvitacionArranque,
  type EstadoInvitacionArranque,
} from '../../domain/services/gym-provisioning';
import type { GymsRepository } from '../ports/gyms.repository';
import type { InvitationMailer } from '../ports/invitation-mailer';
import type { TimezoneCatalog } from '../ports/timezone-catalog';

/** Gimnasio en el listado del SuperAdmin (HU13 - T2, criterio 21). */
export interface GymSummaryDto {
  id: string;
  name: string;
  timezone: string;
  status: 'ACTIVO' | 'INACTIVO';
  createdAt: string;
  administratorCount: number;
  bootstrapInvitation: {
    email: string;
    status: EstadoInvitacionArranque;
    expiresAt: string;
  } | null;
}

/**
 * Listado de gimnasios afiliados. Devuelve sólo datos del gimnasio y de la
 * invitación de arranque: el SuperAdmin no ve alumnos ni su información
 * (RA-06, criterio 18).
 */
export class ListGymsUseCase {
  constructor(
    private readonly gyms: GymsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<GymSummaryDto[]> {
    const now = this.clock.now();
    const gyms = await this.gyms.list();
    return gyms.map((gym) => ({
      id: gym.id,
      name: gym.name,
      timezone: gym.timezone,
      status: gym.active ? 'ACTIVO' : 'INACTIVO',
      createdAt: gym.createdAt.toISOString(),
      administratorCount: gym.administratorCount,
      bootstrapInvitation: gym.bootstrapInvitation
        ? {
            email: gym.bootstrapInvitation.email,
            status: estadoInvitacionArranque(
              gym.bootstrapInvitation.status,
              gym.bootstrapInvitation.issuedAt,
              gym.bootstrapInvitation.expiresAt,
              now,
            ),
            expiresAt: gym.bootstrapInvitation.expiresAt.toISOString(),
          }
        : null,
    }));
  }
}

/**
 * Reemisión de la invitación de arranque (HU13 - criterio 12 y front 10).
 *
 * Se permite mientras no se haya usado: si venció, si fue revocada o si el
 * correo no llegó. La anterior pendiente se revoca para que nunca haya dos
 * enlaces vivos para el mismo primer administrador.
 */
export class ReissueBootstrapInvitationUseCase {
  constructor(
    private readonly gyms: GymsRepository,
    private readonly mailer: InvitationMailer,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorUserId: string;
    gymId: string;
  }): Promise<{ invitationSentTo: string; invitationExpiresAt: string }> {
    const issuedAt = this.clock.now();
    const expiresAt = calcularVencimiento(issuedAt);
    const token = generarTokenDeInvitacion();

    const result = await this.gyms.reissueBootstrapInvitation(
      {
        gymId: input.gymId,
        actorUserId: input.actorUserId,
        invitation: {
          tokenHash: hashearTokenDeInvitacion(token),
          issuedAt,
          expiresAt,
        },
      },
      async (reissued) => {
        try {
          await this.mailer.sendBootstrapInvitation({
            to: reissued.email,
            gymName: reissued.gymName,
            token,
            expiresAt,
          });
        } catch {
          throw new InvitationDeliveryError();
        }
      },
    );

    if (result === 'NO_EXISTE') throw new GymNotFoundError();
    if (result === 'YA_USADA') throw new BootstrapInvitationAlreadyUsedError();

    return {
      invitationSentTo: result.email,
      invitationExpiresAt: result.expiresAt.toISOString(),
    };
  }
}

/** Opciones del selector de zona horaria (front criterio 3). */
export class ListTimezonesUseCase {
  constructor(private readonly timezones: TimezoneCatalog) {}

  execute(): Promise<string[]> {
    return this.timezones.list();
  }
}
