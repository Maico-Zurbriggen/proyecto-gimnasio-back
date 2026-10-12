import { Prisma, type PrismaClient } from '@prisma/client';

import type {
  BeforeCommit,
  GymSummaryRecord,
  GymsRepository,
  ProvisionGymCommand,
  ProvisionedGym,
  ReissueBootstrapCommand,
  ReissuedInvitation,
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
    const gyms = await this.prisma.gym.findMany({
      where: { isPlatform: false },
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
