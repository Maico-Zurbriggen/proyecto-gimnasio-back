import type { PrismaClient } from '@prisma/client';

import { isUuid } from '../../../../shared/types/uuid';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
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
}
