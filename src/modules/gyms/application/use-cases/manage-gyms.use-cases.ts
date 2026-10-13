import type { Clock } from '../../../routines/application/ports/clock';
import {
  calcularVencimiento,
  generarTokenDeInvitacion,
  hashearTokenDeInvitacion,
} from '../../../invitations/domain/services/invitation-validity';
import {
  BootstrapInvitationAlreadyUsedError,
  GymNameTakenError,
  GymNotFoundError,
  InvalidTimezoneError,
  InvitationDeliveryError,
  TimezoneChangeRequiresConfirmationError,
} from '../../domain/errors/gym-errors';
import {
  estadoInvitacionArranque,
  normalizarNombreGimnasio,
  tieneFormaDeZonaIana,
  type EstadoInvitacionArranque,
} from '../../domain/services/gym-provisioning';
import type {
  GymSummaryRecord,
  GymsRepository,
} from '../ports/gyms.repository';
import type { InvitationMailer } from '../../../invitations/application/ports/invitation-mailer';
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
    return gyms.map((gym) => toGymSummaryDto(gym, now));
  }
}

/** Gimnasio como lo ve el SuperAdmin, con el estado efectivo de su invitación. */
export function toGymSummaryDto(
  gym: GymSummaryRecord,
  now: Date,
): GymSummaryDto {
  return {
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
  };
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
          await this.mailer.sendInvitation({
            to: reissued.email,
            gymName: reissued.gymName,
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

/**
 * Edición de un gimnasio (HU13 - criterios 22 y 23). Nada se borra; la zona
 * horaria de un gimnasio con sesiones sólo cambia confirmándolo, porque mueve
 * el día y la semana de todos sus usuarios.
 */
export class UpdateGymUseCase {
  constructor(
    private readonly gyms: GymsRepository,
    private readonly timezones: TimezoneCatalog,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorUserId: string;
    gymId: string;
    name?: string;
    timezone?: string;
    confirmTimezoneChange?: boolean;
  }): Promise<GymSummaryDto> {
    const timezone = input.timezone?.trim();
    if (
      timezone !== undefined &&
      (!tieneFormaDeZonaIana(timezone) ||
        !(await this.timezones.exists(timezone)))
    ) {
      throw new InvalidTimezoneError();
    }
    const result = await this.gyms.update({
      gymId: input.gymId,
      actorUserId: input.actorUserId,
      name:
        input.name === undefined
          ? undefined
          : normalizarNombreGimnasio(input.name),
      timezone,
      confirmTimezoneChange: input.confirmTimezoneChange ?? false,
    });
    switch (result.status) {
      case 'NO_EXISTE':
        throw new GymNotFoundError();
      case 'NOMBRE_DUPLICADO':
        throw new GymNameTakenError();
      case 'REQUIERE_CONFIRMACION':
        throw new TimezoneChangeRequiresConfirmationError(result.sessionCount);
      case 'OK':
        return toGymSummaryDto(result.gym, this.clock.now());
    }
  }
}

/** Suspensión y reactivación sin borrar datos (D2/§1.1, PD-06). */
export class SetGymStatusUseCase {
  constructor(
    private readonly gyms: GymsRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    actorUserId: string;
    gymId: string;
    active: boolean;
  }): Promise<GymSummaryDto> {
    const gym = await this.gyms.setActive(input);
    if (!gym) throw new GymNotFoundError();
    return toGymSummaryDto(gym, this.clock.now());
  }
}
