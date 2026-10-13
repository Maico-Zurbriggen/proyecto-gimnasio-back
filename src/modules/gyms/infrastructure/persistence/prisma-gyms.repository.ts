import { Prisma, type PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  BeforeCommit,
  GymSummaryRecord,
  GymsRepository,
  ProvisionGymCommand,
  ProvisionedGym,
  ReissueBootstrapCommand,
  ReissuedInvitation,
  UpdateGymCommand,
  UpdateGymResult,
} from '../../application/ports/gyms.repository';

/**
 * El envío del correo corre dentro de la transacción; el plazo cubre la
 * latencia del proveedor sin dejar filas bloqueadas indefinidamente.
 */
const OPCIONES_TRANSACCION = { maxWait: 5_000, timeout: 20_000 } as const;

/** Violación del índice único de nombre, venga tipada o no por Prisma. */
function esNombreDuplicado(error: unknown): boolean {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    return true;
  }
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    error.message.includes('gyms_name_unique_idx')
  );
}

export class PrismaGymsRepository implements GymsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async provision(
    command: ProvisionGymCommand,
    beforeCommit: BeforeCommit<ProvisionedGym>,
  ): Promise<ProvisionedGym | 'NOMBRE_DUPLICADO'> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const taken = await tx.gym.findFirst({
          where: {
            isPlatform: false,
            name: { equals: command.name, mode: 'insensitive' },
          },
          select: { id: true },
        });
        if (taken) {
          return 'NOMBRE_DUPLICADO' as const;
        }

        const gym = await tx.gym.create({
          data: { name: command.name, timezone: command.timezone },
          select: { id: true, name: true, timezone: true, createdAt: true },
        });

        await tx.invitation.create({
          data: {
            gymId: gym.id,
            issuedByUserId: null,
            issuedByProvisioning: true,
            emailNormalized: command.adminEmail,
            tokenHash: command.invitation.tokenHash,
            issuedAt: command.invitation.issuedAt,
            expiresAt: command.invitation.expiresAt,
            roles: { create: [{ role: 'ADMINISTRADOR' }] },
          },
        });

        // RN-109: la auditoría registra lo creado, nunca el token.
        await tx.auditLog.create({
          data: {
            actorUserId: command.actorUserId,
            operation: 'ALTA_GIMNASIO',
            entityType: 'GYM',
            entityId: gym.id,
            newValue: {
              nombre: gym.name,
              zonaHoraria: gym.timezone,
              correoPrimerAdministrador: command.adminEmail,
              invitacionVenceEl: command.invitation.expiresAt.toISOString(),
            },
          },
        });

        const provisioned: ProvisionedGym = {
          id: gym.id,
          name: gym.name,
          timezone: gym.timezone,
          createdAt: gym.createdAt,
          adminEmail: command.adminEmail,
          invitationExpiresAt: command.invitation.expiresAt,
        };
        await beforeCommit(provisioned);
        return provisioned;
      }, OPCIONES_TRANSACCION);
    } catch (error) {
      // Dos altas simultáneas con el mismo nombre: la segunda choca con el
      // índice único y no crea nada (criterio 7).
      if (esNombreDuplicado(error)) {
        return 'NOMBRE_DUPLICADO';
      }
      throw error;
    }
  }

  async list(): Promise<GymSummaryRecord[]> {
    return this.query({ isPlatform: false });
  }

  /** Gimnasios con su invitación de arranque más reciente y administradores. */
  private async query(
    where: Prisma.GymWhereInput,
  ): Promise<GymSummaryRecord[]> {
    const gyms = await this.prisma.gym.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        timezone: true,
        active: true,
        createdAt: true,
        invitations: {
          where: { issuedByProvisioning: true },
          orderBy: { issuedAt: 'desc' },
          take: 1,
          select: {
            emailNormalized: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
          },
        },
        _count: {
          select: {
            users: {
              where: {
                state: 'ACTIVO',
                roles: { some: { role: 'ADMINISTRADOR' } },
              },
            },
          },
        },
      },
    });

    return gyms.map((gym) => {
      const invitation = gym.invitations[0];
      return {
        id: gym.id,
        name: gym.name,
        timezone: gym.timezone,
        active: gym.active,
        createdAt: gym.createdAt,
        administratorCount: gym._count.users,
        bootstrapInvitation: invitation
          ? {
              email: invitation.emailNormalized,
              status: invitation.status,
              issuedAt: invitation.issuedAt,
              expiresAt: invitation.expiresAt,
            }
          : null,
      };
    });
  }

  async update(command: UpdateGymCommand): Promise<UpdateGymResult> {
    if (!isUuid(command.gymId)) return { status: 'NO_EXISTE' };
    let outcome: { status: 'OK' } | Exclude<UpdateGymResult, { status: 'OK' }>;
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const gym = await tx.gym.findFirst({
          where: { id: command.gymId, isPlatform: false },
          select: { name: true, timezone: true },
        });
        if (!gym) return { status: 'NO_EXISTE' as const };

        const name = command.name ?? gym.name;
        const timezone = command.timezone ?? gym.timezone;

        if (name.toLowerCase() !== gym.name.toLowerCase()) {
          const taken = await tx.gym.findFirst({
            where: {
              isPlatform: false,
              id: { not: command.gymId },
              name: { equals: name, mode: 'insensitive' },
            },
            select: { id: true },
          });
          if (taken) return { status: 'NOMBRE_DUPLICADO' as const };
        }

        if (timezone !== gym.timezone && !command.confirmTimezoneChange) {
          const sessionCount = await tx.trainingSession.count({
            where: { student: { user: { gymId: command.gymId } } },
          });
          if (sessionCount > 0) {
            return { status: 'REQUIERE_CONFIRMACION' as const, sessionCount };
          }
        }

        await tx.gym.update({
          where: { id: command.gymId },
          data: { name, timezone },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: command.actorUserId,
            operation: 'EDICION_GIMNASIO',
            entityType: 'GYM',
            entityId: command.gymId,
            previousValue: { nombre: gym.name, zonaHoraria: gym.timezone },
            newValue: { nombre: name, zonaHoraria: timezone },
          },
        });
        return { status: 'OK' as const };
      });
    } catch (error) {
      if (esNombreDuplicado(error)) return { status: 'NOMBRE_DUPLICADO' };
      throw error;
    }
    if (outcome.status !== 'OK') return outcome;
    const [gym] = await this.query({ id: command.gymId });
    return gym ? { status: 'OK', gym } : { status: 'NO_EXISTE' };
  }

  async setActive(input: {
    gymId: string;
    actorUserId: string;
    active: boolean;
  }): Promise<GymSummaryRecord | null> {
    if (!isUuid(input.gymId)) return null;
    const changed = await this.prisma.$transaction(async (tx) => {
      const gym = await tx.gym.findFirst({
        where: { id: input.gymId, isPlatform: false },
        select: { active: true },
      });
      if (!gym) return false;
      if (gym.active !== input.active) {
        await tx.gym.update({
          where: { id: input.gymId },
          data: { active: input.active },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: input.actorUserId,
            operation: input.active
              ? 'REACTIVACION_GIMNASIO'
              : 'SUSPENSION_GIMNASIO',
            entityType: 'GYM',
            entityId: input.gymId,
            previousValue: { activo: gym.active },
            newValue: { activo: input.active },
          },
        });
      }
      return true;
    });
    if (!changed) return null;
    return (await this.query({ id: input.gymId }))[0] ?? null;
  }

  async reissueBootstrapInvitation(
    command: ReissueBootstrapCommand,
    beforeCommit: BeforeCommit<ReissuedInvitation>,
  ): Promise<ReissuedInvitation | 'YA_USADA' | 'NO_EXISTE'> {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea el gimnasio: dos reemisiones simultáneas no dejan dos enlaces.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM app.gyms
        WHERE id = ${command.gymId}::uuid AND NOT is_platform
        FOR UPDATE`;
      if (locked.length === 0) {
        return 'NO_EXISTE' as const;
      }

      const gym = await tx.gym.findUniqueOrThrow({
        where: { id: command.gymId },
        select: { name: true },
      });
      const previous = await tx.invitation.findFirst({
        where: { gymId: command.gymId, issuedByProvisioning: true },
        orderBy: { issuedAt: 'desc' },
        select: { id: true, emailNormalized: true, status: true },
      });
      if (!previous) {
        return 'NO_EXISTE' as const;
      }
      if (previous.status === 'USADA') {
        return 'YA_USADA' as const;
      }

      if (previous.status === 'VIGENTE') {
        await tx.invitation.update({
          where: { id: previous.id },
          data: { status: 'REVOCADA' },
        });
      }

      await tx.invitation.create({
        data: {
          gymId: command.gymId,
          issuedByUserId: null,
          issuedByProvisioning: true,
          emailNormalized: previous.emailNormalized,
          tokenHash: command.invitation.tokenHash,
          issuedAt: command.invitation.issuedAt,
          expiresAt: command.invitation.expiresAt,
          roles: { create: [{ role: 'ADMINISTRADOR' }] },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: command.actorUserId,
          operation: 'REEMISION_INVITACION_ARRANQUE',
          entityType: 'GYM',
          entityId: command.gymId,
          newValue: {
            correoPrimerAdministrador: previous.emailNormalized,
            invitacionVenceEl: command.invitation.expiresAt.toISOString(),
          },
        },
      });

      const reissued: ReissuedInvitation = {
        gymName: gym.name,
        email: previous.emailNormalized,
        expiresAt: command.invitation.expiresAt,
      };
      await beforeCommit(reissued);
      return reissued;
    }, OPCIONES_TRANSACCION);
  }
}
