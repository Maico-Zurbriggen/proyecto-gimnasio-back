import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type { UserRole } from '../../../../shared/types/auth';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  CreateInvitationCommand,
  InvitationRecord,
  InvitationsRepository,
  IssuedInvitationRecord,
} from '../../application/ports/invitations.repository';
import {
  InvitationAlreadyUsedError,
  InvitationNotFoundError,
  UserAlreadyExistsError,
} from '../../domain/errors/invitation-errors';

export class PrismaInvitationsRepository implements InvitationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByToken(token: string): Promise<InvitationRecord | null> {
    // El token es el identificador de la invitación. Si no tiene forma de uuid no
    // se consulta: Prisma respondería con un error en lugar de «no existe».
    if (!isUuid(token)) {
      return null;
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: token },
      include: {
        gym: { select: { name: true } },
        roles: { select: { role: true } },
      },
    });
    if (!invitation) {
      return null;
    }

    return {
      id: invitation.id,
      gymId: invitation.gymId,
      gymName: invitation.gym.name,
      emailNormalized: invitation.emailNormalized,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      roles: invitation.roles.map((r) => r.role),
    };
  }

  async completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult> {
    return this.prisma.$transaction(async (tx) => {
      // Se vuelve a leer dentro de la transacción: dos personas con el mismo enlace
      // no pueden crear dos cuentas con la misma invitación.
      const invitation = await tx.invitation.findUnique({
        where: { id: command.invitationId },
        include: { roles: { select: { role: true } } },
      });
      if (!invitation) {
        throw new InvitationNotFoundError();
      }
      if (invitation.status !== 'VIGENTE') {
        throw new InvitationAlreadyUsedError();
      }

      const existing = await tx.user.findUnique({
        where: {
          gymId_emailNormalized: {
            gymId: invitation.gymId,
            emailNormalized: invitation.emailNormalized,
          },
        },
        select: { id: true },
      });
      if (existing) {
        throw new UserAlreadyExistsError();
      }

      const user = await tx.user.create({
        data: {
          gymId: invitation.gymId,
          invitationId: invitation.id,
          emailNormalized: invitation.emailNormalized,
          displayName: command.displayName,
          passwordHash: command.passwordHash,
          state: 'ACTIVO',
          roles: { create: invitation.roles.map((r) => ({ role: r.role })) },
        },
        include: { roles: { select: { role: true } } },
      });

      // Un solo uso (RF-116): la invitación queda consumida en la misma
      // transacción que crea al usuario.
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'USADA' },
      });

      return {
        userId: user.id,
        gymId: user.gymId,
        email: user.emailNormalized,
        displayName: user.displayName,
        roles: user.roles.map((r) => r.role),
      };
    });
  }

  async create(
    command: CreateInvitationCommand,
  ): Promise<
    | IssuedInvitationRecord
    | 'EMAIL_YA_REGISTRADO'
    | 'INVITACION_VIGENTE_EXISTENTE'
  > {
    // Criterio 9: el esquema no garantiza la unicidad, así que las dos
    // comprobaciones y el alta viven en la misma transacción.
    return this.prisma.$transaction(async (tx) => {
      const usuarioExistente = await tx.user.findFirst({
        where: {
          gymId: command.gymId,
          emailNormalized: command.emailNormalized,
        },
        select: { id: true },
      });
      if (usuarioExistente) {
        return 'EMAIL_YA_REGISTRADO' as const;
      }

      const invitacionVigente = await tx.invitation.findFirst({
        where: {
          gymId: command.gymId,
          emailNormalized: command.emailNormalized,
          status: 'VIGENTE',
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (invitacionVigente) {
        return 'INVITACION_VIGENTE_EXISTENTE' as const;
      }

      const created = await tx.invitation.create({
        data: {
          gymId: command.gymId,
          issuedByUserId: command.issuedByUserId,
          emailNormalized: command.emailNormalized,
          expiresAt: command.expiresAt,
          roles: { create: command.roles.map((role) => ({ role })) },
        },
        include: {
          roles: { select: { role: true } },
          issuedBy: { select: { displayName: true } },
        },
      });

      return {
        id: created.id,
        gymId: created.gymId,
        emailNormalized: created.emailNormalized,
        status: created.status,
        issuedAt: created.issuedAt,
        expiresAt: created.expiresAt,
        roles: created.roles.map((r) => r.role as UserRole),
        issuedByUserId: created.issuedByUserId,
        issuedByName: created.issuedBy.displayName,
      };
    });
  }

  async findById(
    invitationId: string,
    gymId: string,
  ): Promise<IssuedInvitationRecord | null> {
    if (!isUuid(invitationId)) {
      return null;
    }

    // El filtro por gimnasio es parte de la consulta: una invitación ajena
    // responde «no existe» (criterio 16, RNF-14).
    const row = await this.prisma.invitation.findFirst({
      where: { id: invitationId, gymId },
      include: {
        roles: { select: { role: true } },
        issuedBy: { select: { displayName: true } },
      },
    });

    return row ? toIssuedRecord(row) : null;
  }

  async list(filtro: {
    gymId: string;
    issuedByUserId?: string;
  }): Promise<IssuedInvitationRecord[]> {
    const rows = await this.prisma.invitation.findMany({
      where: {
        gymId: filtro.gymId,
        ...(filtro.issuedByUserId
          ? { issuedByUserId: filtro.issuedByUserId }
          : {}),
      },
      orderBy: { issuedAt: 'desc' },
      include: {
        roles: { select: { role: true } },
        issuedBy: { select: { displayName: true } },
      },
    });

    return rows.map(toIssuedRecord);
  }

  async revoke(invitationId: string): Promise<void> {
    // `updateMany` no falla si ya cambió de estado: la revocación es idempotente.
    await this.prisma.invitation.updateMany({
      where: { id: invitationId, status: 'VIGENTE' },
      data: { status: 'REVOCADA' },
    });
  }

  async recordAudit(entry: {
    actorUserId: string;
    operation: string;
    invitationId: string;
    newValue: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId,
        operation: entry.operation,
        entityType: 'INVITATION',
        entityId: entry.invitationId,
        previousValue: {},
        newValue: entry.newValue as object,
      },
    });
  }
}

/** Mapea una fila de invitación con sus roles y su emisor. */
function toIssuedRecord(row: {
  id: string;
  gymId: string;
  emailNormalized: string;
  status: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';
  issuedAt: Date;
  expiresAt: Date;
  issuedByUserId: string;
  roles: { role: string }[];
  issuedBy: { displayName: string };
}): IssuedInvitationRecord {
  return {
    id: row.id,
    gymId: row.gymId,
    emailNormalized: row.emailNormalized,
    status: row.status,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    roles: row.roles.map((r) => r.role as UserRole),
    issuedByUserId: row.issuedByUserId,
    issuedByName: row.issuedBy.displayName,
  };
}
