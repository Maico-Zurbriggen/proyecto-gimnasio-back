import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaPasswordRecoveryRepository } from './prisma-password-recovery.repository';
const now = new Date('2026-10-09T12:00:00Z');
function setup() {
  const tx = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi
      .fn()
      .mockImplementation(async (strings: TemplateStringsArray) =>
        strings.join('').includes('RETURNING attempts')
          ? [{ attempts: 1 }]
          : strings.join('').includes('clock_timestamp() AS now')
            ? [{ now }]
            : [],
      ),
    user: {
      findFirst: vi.fn().mockResolvedValue({ id: 'user' }),
      update: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn().mockResolvedValue({ id: 'token', userId: 'user' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    authSession: { findFirst: vi.fn().mockResolvedValue({ id: 'session' }) },
  };
  const transaction = vi.fn(
    async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
  );
  return {
    tx,
    transaction,
    repo: new PrismaPasswordRecoveryRepository({
      $transaction: transaction,
    } as unknown as PrismaClient),
  };
}
describe('password recovery transactional adapter', () => {
  it('invalidates old tokens before creating the new hash and uses a persistent atomic origin counter', async () => {
    const { tx, repo, transaction } = setup();
    await repo.issue({
      email: 'a@gym.test',
      originHash: 'origin-hash',
      tokenHash: 'new-hash',
      now,
      expiresAt: new Date(now.getTime() + 7200000),
    });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user', usedAt: null },
      data: { usedAt: now },
    });
    expect(tx.passwordResetToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user',
        tokenHash: 'new-hash',
        expiresAt: new Date(now.getTime() + 7200000),
      },
    });
    expect(
      tx.passwordResetToken.updateMany.mock.invocationCallOrder[0]!,
    ).toBeLessThan(tx.passwordResetToken.create.mock.invocationCallOrder[0]!);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 250,
      timeout: 1250,
    });
    expect(tx.$queryRaw.mock.calls[0]![0].join('')).toContain('ON CONFLICT');
  });
  it('rejects the third request before account lookup or token creation', async () => {
    const { tx, repo } = setup();
    tx.$queryRaw.mockResolvedValue([{ attempts: 3 }]);
    expect(
      await repo.issue({
        email: 'a@gym.test',
        originHash: 'origin-hash',
        tokenHash: 'new-hash',
        now,
        expiresAt: new Date(now.getTime() + 7200000),
      }),
    ).toEqual({ limited: true, recipients: [] });
    expect(tx.user.findFirst).not.toHaveBeenCalled();
    expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
  });
  it('does not issue to absent, suspended or inactive accounts', async () => {
    for (const absent of [true, false]) {
      const { tx, repo } = setup();
      if (absent) tx.user.findFirst.mockResolvedValue(null as never);
      else
        tx.user.findFirst
          .mockResolvedValueOnce({ id: 'user' })
          .mockResolvedValueOnce(null as never);
      expect(
        (
          await repo.issue({
            email: 'a@gym.test',
            originHash: 'origin-hash',
            tokenHash: 'new-hash',
            now,
            expiresAt: new Date(now.getTime() + 7200000),
          })
        ).recipients,
      ).toEqual([]);
      expect(tx.passwordResetToken.create).not.toHaveBeenCalled();
    }
  });
  it('locks the owner and checks strict expiration after the lock, then changes only password and revokes sessions', async () => {
    const { tx, repo } = setup();
    expect(
      await repo.reset(
        'token-hash',
        'password-hash',
        new Date(now.getTime() - 1000),
      ),
    ).toBe(true);
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'token', usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user' },
      data: { passwordHash: 'password-hash' },
    });
    const revocation = tx.$executeRaw.mock.calls.at(-1)!;
    expect(revocation[0].join('')).toContain(
      'GREATEST(clock_timestamp(), last_activity_at)',
    );
    expect(revocation.slice(1)).toEqual(['user']);
  });
  it('does not modify credentials or sessions when a token was already consumed or expired', async () => {
    const { tx, repo } = setup();
    tx.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });
    expect(await repo.reset('hash', 'password-hash', now)).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
  it('preserves the current session, invalidates recovery links and rejects revoked or foreign sessions', async () => {
    const { tx, repo } = setup();
    expect(await repo.change('user', 'session', 'password-hash', now)).toBe(
      true,
    );
    const revocation = tx.$executeRaw.mock.calls[0]!;
    expect(revocation[0].join('')).toContain('id <>');
    expect(revocation.slice(1)).toEqual(['user', 'session']);
    expect(tx.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'session',
          userId: 'user',
          revokedAt: null,
          expiresAt: { gt: now },
        }),
      }),
    );
    tx.user.update.mockClear();
    tx.authSession.findFirst.mockResolvedValue(null as never);
    expect(await repo.change('user', 'foreign', 'hash', now)).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
