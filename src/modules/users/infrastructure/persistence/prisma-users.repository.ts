import type { PrismaClient } from '@prisma/client';

import type { UsersRepository } from '../../application/ports/users.repository';
import { type UserDomainState, User } from '../../domain/entities/user.entity';

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    const record = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!record) {
      return null;
    }

    return new User({
      id: record.id,
      gymId: record.gymId,
      emailNormalized: record.emailNormalized,
      displayName: record.displayName,
      state: record.state as UserDomainState,
      createdAt: record.createdAt,
    });
  }

  async save(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        state: user.state,
      },
    });
  }
}
