import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PasswordRecoveryRepository } from '../ports/password-recovery.repository';
import { hashearToken } from '../../domain/services/session-token';
import { contrasenaCoincide } from '../../domain/services/password-hasher';
import {
  ChangePasswordUseCase,
  InvalidPasswordSessionError,
  InvalidRecoveryTokenError,
  RequestPasswordRecoveryUseCase,
  ResetPasswordUseCase,
  WeakPasswordError,
} from './password-recovery.use-cases';

const time = vi.hoisted(() => ({ elapsed: 0 }));
vi.mock('node:perf_hooks', () => ({
  performance: { now: () => time.elapsed },
}));
vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));

const now = new Date('2026-10-09T12:00:00Z');
const clock = { now: () => now };
const password = 'Segura2026!';
function repository(): PasswordRecoveryRepository {
  return {
    issue: vi.fn().mockResolvedValue({ limited: false, recipients: [] }),
    reset: vi.fn().mockResolvedValue(true),
    change: vi.fn().mockResolvedValue(true),
  };
}
afterEach(() => {
  time.elapsed = 0;
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('HU09 password recovery', () => {
  it('persists only the token hash, expires in two hours and sends the usable token only to the mailer', async () => {
    const repo = repository();
    vi.mocked(repo.issue).mockResolvedValue({
      limited: false,
      recipients: ['alumno@gym.test'],
    });
    const send = vi.fn();
    await new RequestPasswordRecoveryUseCase(repo, { send }, clock).execute(
      ' ALUMNO@GYM.TEST ',
      '127.0.0.1',
    );
    const [email, token] = send.mock.calls[0]! as [string, string];
    const stored = vi.mocked(repo.issue).mock.calls[0]![0];
    expect(email).toBe('alumno@gym.test');
    expect(stored.tokenHash).toBe(hashearToken(token));
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.expiresAt.toISOString()).toBe('2026-10-09T14:00:00.000Z');
    expect(stored.originHash).toBe(hashearToken('127.0.0.1'));
  });
  it('equalizes elapsed time for known, unknown and suspended accounts and mail failures', async () => {
    for (const known of [true, false]) {
      const repo = repository();
      vi.mocked(repo.issue).mockImplementation(async () => {
        time.elapsed = known ? 600 : 50;
        return { limited: false, recipients: known ? ['alumno@gym.test'] : [] };
      });
      const result = await new RequestPasswordRecoveryUseCase(
        repo,
        {
          send: async () => {
            time.elapsed = 900;
          },
        },
        clock,
      ).execute('alumno@gym.test', 'ip');
      expect(result).toEqual({ limited: false });
      const slept = vi.mocked(delay).mock.calls.at(-1)![0] as number;
      expect(time.elapsed + slept).toBe(3500);
      time.elapsed = 0;
    }
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const repo = repository();
    vi.mocked(repo.issue).mockRejectedValue(new Error('secret'));
    expect(
      await new RequestPasswordRecoveryUseCase(
        repo,
        { send: vi.fn() },
        clock,
      ).execute('a@gym.test', 'ip'),
    ).toEqual({ limited: false });
    expect(log).toHaveBeenCalledWith('Password recovery delivery unavailable');
    log.mockRestore();
  });
  it('does not send email when the persistent origin limit is exhausted', async () => {
    const repo = repository();
    vi.mocked(repo.issue).mockResolvedValue({ limited: true, recipients: [] });
    const send = vi.fn();
    expect(
      await new RequestPasswordRecoveryUseCase(repo, { send }, clock).execute(
        'a@gym.test',
        'ip',
      ),
    ).toEqual({ limited: true });
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects weak and bcrypt-truncated passwords before persistence', async () => {
    const repo = repository();
    const reset = new ResetPasswordUseCase(repo, clock);
    for (const value of [
      'abc',
      'sinmayuscula123',
      'SINMINUSCULA123',
      'SinNumeros',
      'Clave1' + 'é'.repeat(35),
    ])
      await expect(reset.execute('token', value)).rejects.toBeInstanceOf(
        WeakPasswordError,
      );
    expect(repo.reset).not.toHaveBeenCalled();
  });
  it('uses a salted hash, and returns one generic error for rejected tokens', async () => {
    vi.stubEnv('PASSWORD_HASH_COST', '10');
    const repo = repository();
    const reset = new ResetPasswordUseCase(repo, clock);
    await reset.execute('usable-token', password);
    const args = vi.mocked(repo.reset).mock.calls[0]!;
    expect(args[0]).toBe(hashearToken('usable-token'));
    expect(await contrasenaCoincide(password, args[1])).toBe(true);
    vi.mocked(repo.reset).mockResolvedValue(false);
    for (const token of ['expired', 'used', 'superseded', 'unknown'])
      await expect(reset.execute(token, password)).rejects.toBeInstanceOf(
        InvalidRecoveryTokenError,
      );
  });
  it('requires a real current session and changes only its owner', async () => {
    vi.stubEnv('PASSWORD_HASH_COST', '10');
    const repo = repository();
    const change = new ChangePasswordUseCase(repo, clock);
    await expect(
      change.execute('owner', undefined, password),
    ).rejects.toBeInstanceOf(InvalidPasswordSessionError);
    await change.execute('owner', 'session', password);
    expect(repo.change).toHaveBeenCalledWith(
      'owner',
      'session',
      expect.stringMatching(/^\$2b\$/),
      now,
    );
    vi.mocked(repo.change).mockResolvedValue(false);
    await expect(
      change.execute('owner', 'revoked-session', password),
    ).rejects.toBeInstanceOf(InvalidPasswordSessionError);
  });
});
