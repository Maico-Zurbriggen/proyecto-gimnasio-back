import type { PrismaClient } from '@prisma/client';

import {
  InvitationAlreadyUsedError,
  InvitationNotFoundError,
  UserAlreadyExistsError,
} from '../../domain/errors/invitation-errors';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
} from '../../application/ports/invitations.repository';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PrismaInvitationsRepository implements InvitationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByToken(token: string): Promise<InvitationRecord | null> {
    if (!UUID_REGEX.test(token)) {
      return null;
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: token },
      include: {
        gym: true,
        issuedBy: {
          include: {
            roles: true,
          },
        },
        roles: true,
      },
    });

    if (!invitation) {
      return null;
    }

    return {
      id: invitation.id,
      gymId: invitation.gymId,
      gymName: invitation.gym.name,
      issuedByUserId: invitation.issuedByUserId,
      issuedByUserRoles: invitation.issuedBy.roles.map((r) => r.role),
      emailNormalized: invitation.emailNormalized,
      status: invitation.status,
      issuedAt: invitation.issuedAt,
      expiresAt: invitation.expiresAt,
      roles: invitation.roles.map((r) => r.role),
    };
  }

  async completeAccount(
    command: CompleteAccountCommand,
  ): Promise<CompletedAccountResult> {
    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.invitation.findUnique({
        where: { id: command.invitationId },
        include: { roles: true },
      });

      if (!invitation) {
        throw new InvitationNotFoundError();
      }

      if (invitation.status === 'USADA') {
        throw new InvitationAlreadyUsedError();
      }

      const existingUser = await tx.user.findUnique({
        where: {
          gymId_emailNormalized: {
            gymId: invitation.gymId,
            emailNormalized: invitation.emailNormalized,
          },
        },
      });

      if (existingUser) {
        throw new UserAlreadyExistsError();
      }

      const createdUser = await tx.user.create({
        data: {
          gymId: invitation.gymId,
          invitationId: invitation.id,
          emailNormalized: invitation.emailNormalized,
          displayName: command.displayName,
          passwordHash: command.passwordHash,
          state: 'ACTIVO',
          roles: {
            create: invitation.roles.map((r) => ({
              role: r.role,
            })),
          },
        },
        include: {
          roles: true,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          status: 'USADA',
        },
      });

      return {
        userId: createdUser.id,
        gymId: createdUser.gymId,
        email: createdUser.emailNormalized,
        displayName: createdUser.displayName,
        roles: createdUser.roles.map((r) => r.role),
      };
    });
  }
}
