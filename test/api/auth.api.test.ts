import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  AuthRepository,
  AuthSessionRecord,
  CreateSessionCommand,
} from '../../src/modules/auth/application/ports/auth.repository';
import { hashearContrasena } from '../../src/modules/auth/domain/services/password-hasher';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GYM_ID = '99999999-9999-4999-8999-999999999999';
const SESSION_ID = '33333333-3333-4333-8333-333333333333';
const PASSWORD = 'unaClaveSegura123';

const AHORA = new Date('2026-09-20T12:00:00Z');
const clock = { now: () => AHORA };

interface RepoOptions {
  passwordHash: string;
  state?: 'ACTIVO' | 'SUSPENDIDO';
  session?: Partial<AuthSessionRecord>;
}

function createAuthRepo({
  passwordHash,
  state = 'ACTIVO',
  session,
}: RepoOptions) {
  const created: CreateSessionCommand[] = [];
  const revoked: string[] = [];
  const touched: string[] = [];

  const repo: AuthRepository = {
    findCredentialsByEmail: vi.fn(async (email: string) =>
      email === 'alumno@gym.test'
        ? {
            id: USER_ID,
            gymId: GYM_ID,
            passwordHash,
            state,
            roles: ['ALUMNO' as const],
          }
        : null,
    ),
    createSession: vi.fn(async (command: CreateSessionCommand) => {
      created.push(command);
    }),
    findSessionByTokenHash: vi.fn(async (tokenHash: string) => {
      if (!session || session.id === undefined) {
        return null;
      }
      const stored = created.find((c) => c.tokenHash === tokenHash);
      if (!stored && session.revokedAt === undefined) {
        return null;
      }
      return {
        id: SESSION_ID,
        userId: USER_ID,
        gymId: GYM_ID,
        roles: ['ALUMNO' as const],
        lastActivityAt: AHORA,
        expiresAt: new Date('2026-10-20T12:00:00Z'),
        revokedAt: null,
        userState: 'ACTIVO' as const,
        ...session,
      };
    }),
    touchSession: vi.fn(async (sessionId: string) => {
      touched.push(sessionId);
    }),
    revokeSession: vi.fn(async (tokenHash: string) => {
      revoked.push(tokenHash);
    }),
  };

  return { repo, created, revoked, touched };
}

/** Extrae el token de la cookie Set-Cookie de la respuesta. */
function tokenDeCookie(setCookie: string[] | undefined): string | undefined {
  const cookie = setCookie?.find((c) => c.startsWith('gym_session='));
  return cookie?.split(';')[0]?.split('=')[1];
}

describe('Auth API - HU07', () => {
  describe('POST /auth/login (T1)', () => {
    it('issues an httpOnly SameSite=Lax cookie outside production', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, created } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      expect(response.body.user.id).toBe(USER_ID);
      expect(response.body.user.roles).toEqual(['ALUMNO']);

      const setCookie = response.headers['set-cookie'] as unknown as string[];
      const cookie = setCookie.find((c) => c.startsWith('gym_session='));
      expect(cookie).toBeDefined();
      // RNF-16: la cookie no es accesible desde el código de la página.
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).not.toContain('SameSite=None');
      expect(cookie).not.toContain('; Secure');

      // En base queda el hash del token, nunca el token utilizable.
      const token = tokenDeCookie(setCookie);
      expect(created).toHaveLength(1);
      expect(created[0]?.tokenHash).toBe(hashearToken(token ?? ''));
      expect(created[0]?.tokenHash).not.toBe(token);
    });

    it('issues a cross-site secure cookie in production deployments', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        const passwordHash = await hashearContrasena(PASSWORD);
        const { repo } = createAuthRepo({ passwordHash });
        const app = createApp({ authRepository: repo, clock });

        const response = await request(app)
          .post('/auth/login')
          .send({ email: 'alumno@gym.test', password: PASSWORD })
          .expect(200);

        const setCookie = response.headers['set-cookie'] as unknown as string[];
        const cookie = setCookie.find((value) =>
          value.startsWith('gym_session='),
        );

        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=None');
        expect(cookie).not.toContain('SameSite=Lax');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('T3: the session expires 30 days after the login', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, created } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      expect(response.body.expiresAt).toBe('2026-10-20T12:00:00.000Z');
      expect(created[0]?.expiresAt.toISOString()).toBe(
        '2026-10-20T12:00:00.000Z',
      );
    });

    it('rejects a wrong password without creating a session', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, created } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: 'otraClave' })
        .expect(401);

      expect(response.body.error).toBe('invalid_credentials');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(created).toHaveLength(0);
    });

    it('returns the same error for an unknown email, without revealing it exists', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      const desconocido = await request(app)
        .post('/auth/login')
        .send({ email: 'nadie@gym.test', password: PASSWORD })
        .expect(401);

      const claveMala = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: 'otraClave' })
        .expect(401);

      expect(desconocido.body).toEqual(claveMala.body);
    });

    it('rejects a suspended account with the same generic error', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, created } = createAuthRepo({
        passwordHash,
        state: 'SUSPENDIDO',
      });
      const app = createApp({ authRepository: repo, clock });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(401);

      expect(response.body.error).toBe('invalid_credentials');
      expect(created).toHaveLength(0);
    });

    it('rejects an incomplete body', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      await request(app).post('/auth/login').send({}).expect(401);
      await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test' })
        .expect(401);
    });

    it('normalises the email before looking it up', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      await request(app)
        .post('/auth/login')
        .send({ email: '  ALUMNO@Gym.Test  ', password: PASSWORD })
        .expect(200);
    });
  });

  describe('POST /auth/logout (T4)', () => {
    it('revokes the session and clears the cookie', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, revoked } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      const token = tokenDeCookie(
        login.headers['set-cookie'] as unknown as string[],
      );

      const logout = await request(app)
        .post('/auth/logout')
        .set('Cookie', `gym_session=${token ?? ''}`)
        .expect(204);

      expect(revoked).toEqual([hashearToken(token ?? '')]);
      const cleared = logout.headers['set-cookie'] as unknown as string[];
      const clearedCookie = cleared.find((value) =>
        value.startsWith('gym_session=;'),
      );
      expect(clearedCookie).toContain('HttpOnly');
      expect(clearedCookie).toContain('SameSite=Lax');
      expect(clearedCookie).not.toContain('SameSite=None');
      expect(clearedCookie).not.toContain('; Secure');
    });

    it('clears the cross-site cookie with matching production attributes', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      try {
        const { repo } = createAuthRepo({ passwordHash: 'unused' });
        const app = createApp({ authRepository: repo, clock });

        const logout = await request(app).post('/auth/logout').expect(204);

        const cleared = logout.headers['set-cookie'] as unknown as string[];
        const clearedCookie = cleared.find((value) =>
          value.startsWith('gym_session=;'),
        );

        expect(clearedCookie).toContain('HttpOnly');
        expect(clearedCookie).toContain('Secure');
        expect(clearedCookie).toContain('SameSite=None');
        expect(clearedCookie).not.toContain('SameSite=Lax');
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it('is idempotent: logging out without a session still succeeds', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo, revoked } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      await request(app).post('/auth/logout').expect(204);
      expect(revoked).toHaveLength(0);
    });
  });

  describe('GET /auth/me (T2 y T7)', () => {
    it('resolves the identity from the session cookie', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({
        passwordHash,
        session: { id: SESSION_ID },
      });
      const app = createApp({ authRepository: repo, clock });

      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      const token = tokenDeCookie(
        login.headers['set-cookie'] as unknown as string[],
      );

      const me = await request(app)
        .get('/auth/me')
        .set('Cookie', `gym_session=${token ?? ''}`)
        .expect(200);

      expect(me.body.user.id).toBe(USER_ID);
      expect(me.body.user.gymId).toBe(GYM_ID);
    });

    it('T7: returns 401 without a session', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      await request(app).get('/auth/me').expect(401);
    });

    it('T3 y T7: returns 401 with an expired session', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({
        passwordHash,
        session: {
          id: SESSION_ID,
          expiresAt: new Date('2026-09-19T12:00:00Z'),
        },
      });
      const app = createApp({ authRepository: repo, clock });

      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      const token = tokenDeCookie(
        login.headers['set-cookie'] as unknown as string[],
      );

      await request(app)
        .get('/auth/me')
        .set('Cookie', `gym_session=${token ?? ''}`)
        .expect(401);
    });

    it('T4 y T7: returns 401 with a revoked session', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({
        passwordHash,
        session: {
          id: SESSION_ID,
          revokedAt: new Date('2026-09-20T11:00:00Z'),
        },
      });
      const app = createApp({ authRepository: repo, clock });

      const login = await request(app)
        .post('/auth/login')
        .send({ email: 'alumno@gym.test', password: PASSWORD })
        .expect(200);

      const token = tokenDeCookie(
        login.headers['set-cookie'] as unknown as string[],
      );

      await request(app)
        .get('/auth/me')
        .set('Cookie', `gym_session=${token ?? ''}`)
        .expect(401);
    });

    it('returns 401 with an unknown token', async () => {
      const passwordHash = await hashearContrasena(PASSWORD);
      const { repo } = createAuthRepo({ passwordHash });
      const app = createApp({ authRepository: repo, clock });

      await request(app)
        .get('/auth/me')
        .set('Cookie', 'gym_session=token-inventado')
        .expect(401);
    });
  });
});
