import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  AuthRepository,
  CreateSessionCommand,
} from '../../src/modules/auth/application/ports/auth.repository';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
} from '../../src/modules/invitations/application/ports/invitations.repository';

const TOKEN_VIGENTE = 'e48ca620-13d8-4f24-9b59-7b70743b1790';
const TOKEN_USADO = 'e48ca620-13d8-4f24-9b59-7b70743b1791';
const TOKEN_REVOCADO = 'e48ca620-13d8-4f24-9b59-7b70743b1792';
const TOKEN_VENCIDO = 'e48ca620-13d8-4f24-9b59-7b70743b1793';
const GYM_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

const AHORA = new Date('2026-09-21T10:00:00Z');
const clock = { now: () => AHORA };

function invitacion(
  id: string,
  status: InvitationRecord['status'] = 'VIGENTE',
  expiresAt = new Date('2026-09-25T10:00:00Z'),
): InvitationRecord {
  return {
    id,
    gymId: GYM_ID,
    gymName: 'Gimnasio Central',
    emailNormalized: 'nuevo.alumno@gym.test',
    status,
    expiresAt,
    roles: ['ALUMNO'],
  };
}

const REGISTROS: Record<string, InvitationRecord> = {
  [TOKEN_VIGENTE]: invitacion(TOKEN_VIGENTE),
  [TOKEN_USADO]: invitacion(TOKEN_USADO, 'USADA'),
  [TOKEN_REVOCADO]: invitacion(TOKEN_REVOCADO, 'REVOCADA'),
  [TOKEN_VENCIDO]: invitacion(
    TOKEN_VENCIDO,
    'VIGENTE',
    new Date('2026-09-20T10:00:00Z'),
  ),
};

function buildApp() {
  const sessions: CreateSessionCommand[] = [];

  const invitationsRepository: InvitationsRepository = {
    findByToken: vi.fn((token: string) =>
      Promise.resolve(REGISTROS[token] ?? null),
    ),
    completeAccount: vi.fn((command: CompleteAccountCommand) => {
      const record = REGISTROS[command.invitationId];
      return Promise.resolve<CompletedAccountResult>({
        userId: USER_ID,
        gymId: record?.gymId ?? GYM_ID,
        email: record?.emailNormalized ?? 'nuevo.alumno@gym.test',
        displayName: command.displayName,
        roles: record?.roles ?? ['ALUMNO'],
      });
    }),
  };

  const authRepository: AuthRepository = {
    findCredentialsByEmail: () => Promise.resolve(null),
    createSession: vi.fn((command: CreateSessionCommand) => {
      sessions.push(command);
      return Promise.resolve();
    }),
    findSessionByTokenHash: () => Promise.resolve(null),
    touchSession: () => Promise.resolve(),
    revokeSession: () => Promise.resolve(),
  };

  const app = createApp({ invitationsRepository, authRepository, clock });
  return { app, invitationsRepository, sessions };
}

/** Valor de la cookie de sesión emitida en la respuesta. */
function cookieDeSesion(response: request.Response): string | undefined {
  const headers = response.headers['set-cookie'];
  const cookies = Array.isArray(headers) ? headers : [headers];
  const cookie = cookies.find((value) => value?.startsWith('gym_session='));
  return cookie?.split(';')[0]?.split('=')[1];
}

describe('Invitations API - HU06', () => {
  describe('GET /invitations/:token (T1 y T6)', () => {
    it('devuelve los datos públicos de una invitación vigente', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get(`/invitations/${TOKEN_VIGENTE}`)
        .expect(200);

      expect(response.body).toEqual({
        id: TOKEN_VIGENTE,
        gymId: GYM_ID,
        gymName: 'Gimnasio Central',
        email: 'nuevo.alumno@gym.test',
        roles: ['ALUMNO'],
        expiresAt: '2026-09-25T10:00:00.000Z',
      });
    });

    it('devuelve 404 cuando el token no existe', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get('/invitations/00000000-0000-4000-8000-000000000000')
        .expect(404);

      expect(response.body.error).toBe('invitation_not_found');
    });

    it('T6: 409 con mensaje propio si la invitación ya fue usada', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get(`/invitations/${TOKEN_USADO}`)
        .expect(409);

      expect(response.body.error).toBe('invitation_already_used');
      expect(response.body.message).toBe('Esta invitación ya fue utilizada');
    });

    it('T6: 410 con mensaje propio si la invitación fue revocada', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get(`/invitations/${TOKEN_REVOCADO}`)
        .expect(410);

      expect(response.body.error).toBe('invitation_revoked');
      expect(response.body.message).toBe('La invitación ha sido revocada');
    });

    it('T6: 410 con mensaje propio si la invitación venció', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get(`/invitations/${TOKEN_VENCIDO}`)
        .expect(410);

      expect(response.body.error).toBe('invitation_expired');
      expect(response.body.message).toBe('La invitación ha caducado');
    });
  });

  describe('POST /invitations/:token/complete (T2, T3 y T4)', () => {
    it('T2 y T3: crea la cuenta y deja la sesión abierta por cookie', async () => {
      const { app, invitationsRepository, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'ClaveSegura2026' })
        .expect(201);

      expect(response.body).toEqual({
        user: { id: USER_ID, gymId: GYM_ID, roles: ['ALUMNO'] },
        expiresAt: '2026-10-21T10:00:00.000Z',
      });
      expect(invitationsRepository.completeAccount).toHaveBeenCalledTimes(1);

      // El token viaja sólo en la cookie httpOnly (RNF-16) y en base queda su hash.
      expect(response.body).not.toHaveProperty('token');
      const token = cookieDeSesion(response);
      expect(token).toBeTruthy();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).toBe(hashearToken(token ?? ''));

      const cookieHeader = response.headers['set-cookie']?.[0] ?? '';
      expect(cookieHeader).toContain('HttpOnly');
    });

    it('la contraseña se almacena hasheada con bcrypt, no en claro', async () => {
      const { app, invitationsRepository } = buildApp();

      await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'ClaveSegura2026' })
        .expect(201);

      const command = vi.mocked(invitationsRepository.completeAccount).mock
        .calls[0]?.[0];
      expect(command?.passwordHash).not.toBe('ClaveSegura2026');
      expect(command?.passwordHash.startsWith('$2')).toBe(true);
    });

    it('devuelve 400 con el cuerpo incompleto', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('invalid_request_body');
    });

    it('T4: devuelve 422 y los requisitos incumplidos de la contraseña', async () => {
      const { app, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'passwordfacil' })
        .expect(422);

      expect(response.body.error).toBe('weak_password');
      expect(response.body.details).toContain(
        'Debe contener al menos una letra mayúscula.',
      );
      expect(response.body.details).toContain(
        'Debe contener al menos un número.',
      );
      expect(sessions).toHaveLength(0);
    });

    it('no completa una invitación vencida ni emite cookie', async () => {
      const { app, invitationsRepository, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VENCIDO}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'ClaveSegura2026' })
        .expect(410);

      expect(response.body.error).toBe('invitation_expired');
      expect(invitationsRepository.completeAccount).not.toHaveBeenCalled();
      expect(sessions).toHaveLength(0);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('no completa una invitación ya usada', async () => {
      const { app, invitationsRepository } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_USADO}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'ClaveSegura2026' })
        .expect(409);

      expect(response.body.error).toBe('invitation_already_used');
      expect(invitationsRepository.completeAccount).not.toHaveBeenCalled();
    });
  });
});
