import type { PrismaClient } from '@prisma/client';

import type { UserRole } from '../../../../shared/types/auth';
import { isUuid } from '../../../../shared/types/uuid';
import type {
  AuthRepository,
  AuthSessionRecord,
  CreateSessionCommand,
  UserCredentialsRecord,
} from '../../application/ports/auth.repository';

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCredentialsByEmail(
    emailNormalized: string,
  ): Promise<UserCredentialsRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: { emailNormalized },
      select: {
        id: true,
        gymId: true,
        passwordHash: true,
        state: true,
        roles: { select: { role: true } },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      gymId: user.gymId,
      passwordHash: user.passwordHash,
      state: user.state,
      roles: user.roles.map((assignment) => assignment.role as UserRole),
    };
  }

  async createSession(command: CreateSessionCommand): Promise<void> {
    await this.prisma.authSession.create({
      data: {
        userId: command.userId,
        tokenHash: command.tokenHash,
        expiresAt: command.expiresAt,
      },
    });
  }

  async findSessionByTokenHash(
    tokenHash: string,
  ): Promise<AuthSessionRecord | null> {
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        lastActivityAt: true,
        expiresAt: true,
        revokedAt: true,
        user: {
          select: {
            gymId: true,
            state: true,
            roles: { select: { role: true } },
          },
        },
      },
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      userId: session.userId,
      gymId: session.user.gymId,
      roles: session.user.roles.map((a) => a.role as UserRole),
      lastActivityAt: session.lastActivityAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      userState: session.user.state,
    };
  }

  async touchSession(
    sessionId: string,
    lastActivityAt: Date,
    expiresAt: Date,
  ): Promise<void> {
    if (!isUuid(sessionId)) {
      return;
    }
    await this.prisma.authSession.update({
      where: { id: sessionId },
      data: { lastActivityAt, expiresAt },
    });
  }

  async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
    // `updateMany` no falla si el token no existe: cerrar sesión es idempotente.
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }
}
