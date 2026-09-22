import bcrypt from 'bcryptjs';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { Clock } from '../../src/modules/routines/application/ports/clock';
import type { AuthUsersRepository } from '../../src/modules/auth/application/ports/auth-users.repository';
import type { SessionsRepository } from '../../src/modules/auth/application/ports/sessions.repository';
import { hashSessionToken } from '../../src/modules/auth/domain/services/session-token';
import type { RoutineGenerationsRepository } from '../../src/modules/routine-generations/application/ports/routine-generations.repository';

describe('Auth API', () => {
  const fixedNow = new Date('2026-09-21T12:00:00Z');
  const mockClock: Clock = { now: () => fixedNow };

  const alumnoId = '44444444-4444-4444-a444-444444444444';
  const trainerId = '33333333-3333-4333-a333-333333333333';
  const passwordHash = bcrypt.hashSync('GimnasioTest2026!', 4);

  function usersFake(
    byEmail: Record<string, object | null>,
    byId: Record<string, object | null> = {},
  ): AuthUsersRepository {
    return {
      findByEmail: vi.fn(async (email: string) => byEmail[email] ?? null),
      findById: vi.fn(async (id: string) => byId[id] ?? null),
    };
  }

  function credentialsFor(id: string, roles: string[], state = 'ACTIVO') {
    return { id, gymId: 'gym-1', passwordHash, state, roles };
  }

  function inMemorySessions(): SessionsRepository {
    const rows = new Map<
      string,
      { userId: string; expiresAt: Date; revokedAt: Date | null }
    >();
    return {
      create: vi.fn(async (input) => {
        rows.set(input.tokenHash, {
          userId: input.userId,
          expiresAt: input.expiresAt,
          revokedAt: null,
        });
        return { ...input, revokedAt: null };
      }),
      findByTokenHash: vi.fn(async (tokenHash: string) => {
        const row = rows.get(tokenHash);
        return row ? { tokenHash, ...row } : null;
      }),
      revoke: vi.fn(async (tokenHash: string, revokedAt: Date) => {
        const row = rows.get(tokenHash);
        if (row) {
          row.revokedAt = revokedAt;
        }
      }),
      touch: vi.fn(async () => {}),
    };
  }

  function sessionCookieHeader(setCookie: unknown): string {
    const header = Array.isArray(setCookie)
      ? String(setCookie[0])
      : String(setCookie);
    return String(header.split(';')[0]);
  }

  describe('POST /auth/login', () => {
    it('creates a session, sets the httpOnly cookie and returns the user', async () => {
      const sessions = inMemorySessions();
      const app = createApp({
        clock: mockClock,
        sessionTtlHours: 2,
        authUsersRepository: usersFake({
          'alumno.martin@gimnasio.test': credentialsFor(alumnoId, ['ALUMNO']),
        }),
        sessionsRepository: sessions,
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'alumno.martin@gimnasio.test',
          password: 'GimnasioTest2026!',
        })
        .expect(200);

      expect(response.body).toEqual({
        user: { id: alumnoId, gymId: 'gym-1', roles: ['ALUMNO'] },
        expiresAt: '2026-09-21T14:00:00.000Z',
      });
      const setCookie = String(response.headers['set-cookie']);
      expect(setCookie).toMatch(/^gym_session=[0-9a-f]{64}/);
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(sessions.create).toHaveBeenCalledWith({
        tokenHash: expect.any(String),
        userId: alumnoId,
        expiresAt: new Date('2026-09-21T14:00:00.000Z'),
      });
    });

    it('returns 401 on wrong password without setting a cookie', async () => {
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake({
          'alumno.martin@gimnasio.test': credentialsFor(alumnoId, ['ALUMNO']),
        }),
        sessionsRepository: inMemorySessions(),
      });

      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'alumno.martin@gimnasio.test',
          password: 'wrong',
        })
        .expect(401);

      expect(response.body).toEqual({ error: 'invalid_credentials' });
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('returns 401 for unknown emails and suspended users alike', async () => {
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake({
          'alumna.sofia@gimnasio.test': credentialsFor(
            '55555555-5555-4555-a555-555555555555',
            ['ALUMNO'],
            'SUSPENDIDO',
          ),
        }),
        sessionsRepository: inMemorySessions(),
      });

      await request(app)
        .post('/auth/login')
        .send({ email: 'nobody@gimnasio.test', password: 'whatever' })
        .expect(401);
      const response = await request(app)
        .post('/auth/login')
        .send({
          email: 'alumna.sofia@gimnasio.test',
          password: 'GimnasioTest2026!',
        })
        .expect(401);

      expect(response.body).toEqual({ error: 'invalid_credentials' });
    });

    it('returns 400 on an invalid body', async () => {
      const app = createApp({ clock: mockClock });

      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'not-an-email' })
        .expect(400);

      expect(response.body.error).toBe('invalid_request_body');
    });
  });

  describe('GET /auth/me', () => {
    it('returns the session user for a valid cookie', async () => {
      const sessions = inMemorySessions();
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake(
          {
            'alumno.martin@gimnasio.test': credentialsFor(alumnoId, ['ALUMNO']),
          },
          { [alumnoId]: credentialsFor(alumnoId, ['ALUMNO']) },
        ),
        sessionsRepository: sessions,
      });

      const login = await request(app)
        .post('/auth/login')
        .send({
          email: 'alumno.martin@gimnasio.test',
          password: 'GimnasioTest2026!',
        })
        .expect(200);

      const response = await request(app)
        .get('/auth/me')
        .set('Cookie', sessionCookieHeader(login.headers['set-cookie']))
        .expect(200);

      expect(response.body).toEqual({
        user: { id: alumnoId, gymId: 'gym-1', roles: ['ALUMNO'] },
      });
      expect(sessions.touch).toHaveBeenCalled();
    });

    it('returns 401 without a cookie or with an unknown one', async () => {
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake({}),
        sessionsRepository: inMemorySessions(),
      });

      await request(app).get('/auth/me').expect(401);
      const response = await request(app)
        .get('/auth/me')
        .set('Cookie', 'gym_session=unknown')
        .expect(401);

      expect(response.body).toEqual({ error: 'unauthorized' });
    });
  });

  describe('POST /auth/logout', () => {
    it('revokes the session and clears the cookie', async () => {
      const sessions = inMemorySessions();
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake(
          {
            'alumno.martin@gimnasio.test': credentialsFor(alumnoId, ['ALUMNO']),
          },
          { [alumnoId]: credentialsFor(alumnoId, ['ALUMNO']) },
        ),
        sessionsRepository: sessions,
      });

      const login = await request(app)
        .post('/auth/login')
        .send({
          email: 'alumno.martin@gimnasio.test',
          password: 'GimnasioTest2026!',
        })
        .expect(200);
      const cookie = sessionCookieHeader(login.headers['set-cookie']);

      const logout = await request(app)
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      expect(String(logout.headers['set-cookie'])).toMatch(/gym_session=;/);

      await request(app).get('/auth/me').set('Cookie', cookie).expect(401);
    });

    it('is a no-op returning 204 without a cookie', async () => {
      const sessions = inMemorySessions();
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake({}),
        sessionsRepository: sessions,
      });

      await request(app).post('/auth/logout').expect(204);

      expect(sessions.revoke).not.toHaveBeenCalled();
    });
  });

  describe('session middleware', () => {
    it('authenticates a protected route from the cookie', async () => {
      const requestId = '55555555-5555-4555-a555-555555555555';
      const studentId = '11111111-1111-4111-a111-111111111111';
      const sessions = inMemorySessions();
      await sessions.create({
        tokenHash: hashSessionToken('staff-cookie-token'),
        userId: trainerId,
        expiresAt: new Date('2026-09-22T00:00:00Z'),
      });
      const routineGenerationsRepository: RoutineGenerationsRepository = {
        findById: vi.fn().mockResolvedValue({
          requestId,
          status: 'COMPLETADA',
          estructuraCandidata: null,
          violaciones: null,
          error: null,
        }),
        findRequestOwner: vi.fn(),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
      };
      const app = createApp({
        clock: mockClock,
        authUsersRepository: usersFake(
          {},
          { [trainerId]: credentialsFor(trainerId, ['ENTRENADOR']) },
        ),
        sessionsRepository: sessions,
        routineGenerationsRepository,
      });

      const response = await request(app)
        .get(`/students/${studentId}/routine-generations/${requestId}`)
        .set('Cookie', 'gym_session=staff-cookie-token')
        .expect(200);

      expect(response.body.requestId).toBe(requestId);
    });
  });
});
