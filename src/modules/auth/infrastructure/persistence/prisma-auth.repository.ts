import type { PrismaClient } from '@prisma/client';

import type {
  AuthUserCredentials,
  AuthUsersRepository,
} from '../../application/ports/auth-users.repository';
import type {
  AuthSessionRecord,
  CreateSessionInput,
  SessionsRepository,
} from '../../application/ports/sessions.repository';

export class PrismaAuthRepository
  implements AuthUsersRepository, SessionsRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<AuthUserCredentials | null> {
    // El login no distingue gimnasio: ante el mismo correo en varios
    // gimnasios se autentica el usuario más antiguo. Multi-tenant real
    // queda fuera del alcance inicial.
    const record = await this.prisma.user.findFirst({
      where: { emailNormalized: email },
      include: { roles: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!record) {
      return null;
    }
    return {
      id: record.id,
      gymId: record.gymId,
      passwordHash: record.passwordHash,
      state: record.state,
      roles: record.roles.map((assignment) => assignment.role),
    };
  }

  async findById(id: string): Promise<AuthUserCredentials | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: true },
    });
    if (!record) {
      return null;
    }
    return {
      id: record.id,
      gymId: record.gymId,
      passwordHash: record.passwordHash,
      state: record.state,
      roles: record.roles.map((assignment) => assignment.role),
    };
  }

  async create(input: CreateSessionInput): Promise<AuthSessionRecord> {
    const record = await this.prisma.authSession.create({
      data: {
        tokenHash: input.tokenHash,
        userId: input.userId,
        expiresAt: input.expiresAt,
      },
    });
    return {
      tokenHash: record.tokenHash,
      userId: record.userId,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    };
  }

  async findByTokenHash(tokenHash: string): Promise<AuthSessionRecord | null> {
    const record = await this.prisma.authSession.findUnique({
      where: { tokenHash },
    });
    if (!record) {
      return null;
    }
    return {
      tokenHash: record.tokenHash,
      userId: record.userId,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
    };
  }

  async revoke(tokenHash: string, revokedAt: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt },
    });
  }

  async touch(tokenHash: string, at: Date): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash },
      data: { lastActivityAt: at },
    });
  }
}
