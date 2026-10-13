import type { PrismaClient } from '@prisma/client';
import type { PasswordRecoveryRepository } from '../../application/ports/password-recovery.repository';

export class PrismaPasswordRecoveryRepository implements PasswordRecoveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async issue(input: Parameters<PasswordRecoveryRepository['issue']>[0]) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '1000ms'`;
        const day = input.now.toISOString().slice(0, 10);
        const rows = await tx.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO app.password_recovery_limits (origin_hash, day, attempts)
        VALUES (${input.originHash}, ${day}::date, 1)
        ON CONFLICT (origin_hash, day) DO UPDATE
        SET attempts = LEAST(app.password_recovery_limits.attempts + 1, 3)
        RETURNING attempts`;
        if ((rows[0]?.attempts ?? 3) > 2)
          return { limited: true, recipients: [] };
        // Usa la misma selección determinista de cuenta que el login por correo.
        const user = await tx.user.findFirst({
          where: { emailNormalized: input.email },
          orderBy: { id: 'asc' },
        });
        if (user) {
          await tx.$queryRaw`SELECT id FROM app.users WHERE id = ${user.id}::uuid FOR UPDATE`;
          const active = await tx.user.findFirst({
            where: { id: user.id, state: 'ACTIVO', gym: { active: true } },
          });
          if (!active) return { limited: false, recipients: [] };
          await tx.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: input.now },
          });
          await tx.passwordResetToken.create({
            data: {
              userId: user.id,
              tokenHash: input.tokenHash,
              expiresAt: input.expiresAt,
            },
          });
          return { limited: false, recipients: [input.email] };
        }
        return { limited: false, recipients: [] };
      },
      { maxWait: 250, timeout: 1250 },
    );
  }

  async reset(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
      });
      if (!token) return false;
      await tx.$queryRaw`SELECT id FROM app.users WHERE id = ${token.userId}::uuid FOR UPDATE`;
      const time = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      now = time[0]!.now;
      const user = await tx.user.findFirst({
        where: { id: token.userId, state: 'ACTIVO', gym: { active: true } },
      });
      if (!user) return false;
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.$executeRaw`UPDATE app.auth_sessions
        SET revoked_at = GREATEST(clock_timestamp(), last_activity_at)
        WHERE user_id = ${user.id}::uuid AND revoked_at IS NULL`;
      return true;
    });
  }

  async change(
    userId: string,
    sessionId: string,
    passwordHash: string,
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM app.users WHERE id = ${userId}::uuid FOR UPDATE`;
      const time = await tx.$queryRaw<
        Array<{ now: Date }>
      >`SELECT clock_timestamp() AS now`;
      now = time[0]!.now;
      const session = await tx.authSession.findFirst({
        where: {
          id: sessionId,
          userId,
          revokedAt: null,
          expiresAt: { gt: now },
          user: { state: 'ACTIVO', gym: { active: true } },
        },
      });
      if (!session) return false;
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.$executeRaw`UPDATE app.auth_sessions
        SET revoked_at = GREATEST(clock_timestamp(), last_activity_at)
        WHERE user_id = ${userId}::uuid AND id <> ${sessionId}::uuid AND revoked_at IS NULL`;
      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null },
        data: { usedAt: now },
      });
      return true;
    });
  }
}
