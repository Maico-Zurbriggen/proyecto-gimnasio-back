import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { PasswordRecoveryRepository } from '../../src/modules/auth/application/ports/password-recovery.repository';
import type { AuthRepository } from '../../src/modules/auth/application/ports/auth.repository';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';
vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn().mockResolvedValue(undefined),
}));
const id = '11111111-1111-4111-8111-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';
const now = new Date();
function setup() {
  const repo: PasswordRecoveryRepository = {
    issue: vi.fn().mockResolvedValue({ limited: false, recipients: [] }),
    reset: vi.fn().mockResolvedValue(true),
    change: vi.fn().mockResolvedValue(true),
  };
  const auth: AuthRepository = {
    findCredentialsByEmail: vi.fn(),
    createSession: vi.fn(),
    revokeSession: vi.fn(),
    touchSession: vi.fn(),
    findSessionByTokenHash: vi.fn().mockResolvedValue({
      id: sessionId,
      userId: id,
      gymId: '99999999-9999-4999-8999-999999999999',
      roles: ['ALUMNO'],
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + 60000),
      revokedAt: null,
      userState: 'ACTIVO',
    }),
  };
  const send = vi.fn();
  return {
    repo,
    auth,
    send,
    app: createApp({
      passwordRecoveryRepository: repo,
      recoveryMailer: { send },
      authRepository: auth,
      clock: { now: () => now },
    }),
  };
}
afterEach(() => vi.unstubAllEnvs());
describe('HU09 password recovery API', () => {
  it('returns exactly the same status and payload for active, unknown and suspended emails', async () => {
    const { app, repo, send } = setup();
    const responses = [];
    for (const recipients of [['active@gym.test'], [], []]) {
      vi.mocked(repo.issue).mockResolvedValue({ limited: false, recipients });
      responses.push(
        await request(app)
          .post('/auth/password-recovery')
          .send({ email: 'active@gym.test' })
          .expect(202),
      );
    }
    expect(responses[0]!.body).toEqual(responses[1]!.body);
    expect(responses[1]!.body).toEqual(responses[2]!.body);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(responses[0]!.body)).not.toContain('token');
  });
  it('uses the connection origin instead of an untrusted forwarding header, and returns 429', async () => {
    const { app, repo } = setup();
    vi.mocked(repo.issue).mockResolvedValue({ limited: true, recipients: [] });
    await request(app)
      .post('/auth/password-recovery')
      .set('X-Forwarded-For', 'attacker')
      .send({ email: 'active@gym.test' })
      .expect(429);
    expect(vi.mocked(repo.issue).mock.calls[0]![0].originHash).not.toBe(
      hashearToken('attacker'),
    );
  });
  it('accepts a valid reset without exposing a password or a session cookie', async () => {
    vi.stubEnv('PASSWORD_HASH_COST', '10');
    const { app } = setup();
    const response = await request(app)
      .post('/auth/password-reset')
      .send({ token: 'valid', password: 'NuevaSegura2026' })
      .expect(204);
    expect(response.text).toBe('');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
  it('rejects expired, reused, superseded and unknown tokens with one error', async () => {
    vi.stubEnv('PASSWORD_HASH_COST', '10');
    const { app, repo } = setup();
    vi.mocked(repo.reset).mockResolvedValue(false);
    for (const token of ['expired', 'used', 'superseded', 'unknown']) {
      const response = await request(app)
        .post('/auth/password-reset')
        .send({ token, password: 'NuevaSegura2026' })
        .expect(400);
      expect(response.body).toEqual({ error: 'invalid_recovery_token' });
    }
  });
  it('requires a valid current session and refuses parameters targeting another user', async () => {
    vi.stubEnv('PASSWORD_HASH_COST', '10');
    const { app, auth, repo } = setup();
    await request(app)
      .post('/auth/password-change')
      .send({ password: 'NuevaSegura2026' })
      .expect(401);
    await request(app)
      .post('/auth/password-change')
      .set('Cookie', 'gym_session=current')
      .send({ password: 'NuevaSegura2026', userId: 'other' })
      .expect(400);
    await request(app)
      .post('/auth/password-change')
      .set('Cookie', 'gym_session=current')
      .send({ password: 'NuevaSegura2026' })
      .expect(204);
    expect(repo.change).toHaveBeenCalledWith(
      id,
      sessionId,
      expect.any(String),
      now,
    );
    vi.mocked(auth.findSessionByTokenHash).mockResolvedValue(null);
    await request(app)
      .post('/auth/password-change')
      .set('Cookie', 'gym_session=revoked')
      .send({ password: 'NuevaSegura2026' })
      .expect(401);
  });
  it('rejects weak passwords without invoking persistence', async () => {
    const { app, repo } = setup();
    await request(app)
      .post('/auth/password-reset')
      .send({ token: 'valid', password: 'weak' })
      .expect(400);
    expect(repo.reset).not.toHaveBeenCalled();
  });
});
