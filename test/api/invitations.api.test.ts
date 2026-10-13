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
import { InMemoryAttemptLimiter } from '../../src/modules/invitations/infrastructure/persistence/in-memory-attempt-limiter';

const TOKEN_VIGENTE = 'vigente_Yq3n8Kd2Lm5Pz7Rt0Vw4Xs6Bc9Fg1Hj';
const TOKEN_USADO = 'usado_Yq3n8Kd2Lm5Pz7Rt0Vw4Xs6Bc9Fg1Hj';
const TOKEN_REVOCADO = 'revocado_Yq3n8Kd2Lm5Pz7Rt0Vw4Xs6Bc9Fg1H';
const TOKEN_VENCIDO = 'vencido_Yq3n8Kd2Lm5Pz7Rt0Vw4Xs6Bc9Fg1Hj';
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
    issuedAt: new Date('2026-09-15T10:00:00Z'),
    expiresAt,
    roles: ['ALUMNO'],
    trainerName: 'Lucía Entrenadora',
  };
}

/** Como la tabla: indexada por el hash del token, nunca por el token. */
const REGISTROS: Record<string, InvitationRecord> = {
  [hashearToken(TOKEN_VIGENTE)]: invitacion('inv-vigente'),
  [hashearToken(TOKEN_USADO)]: invitacion('inv-usada', 'USADA'),
  [hashearToken(TOKEN_REVOCADO)]: invitacion('inv-revocada', 'REVOCADA'),
  [hashearToken(TOKEN_VENCIDO)]: invitacion(
    'inv-vencida',
    'VIGENTE',
    new Date('2026-09-20T10:00:00Z'),
  ),
};

function buildApp() {
  const sessions: CreateSessionCommand[] = [];

  const invitationsRepository: InvitationsRepository = {
    issue: vi.fn(() => Promise.reject(new Error('no usado'))),
    list: vi.fn(() => Promise.resolve([])),
    findByTokenHash: vi.fn((tokenHash: string) =>
      Promise.resolve(REGISTROS[tokenHash] ?? null),
    ),
    completeAccount: vi.fn((command: CompleteAccountCommand) => {
      const record = Object.values(REGISTROS).find(
        (item) => item.id === command.invitationId,
      );
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

  const app = createApp({
    invitationsRepository,
    authRepository,
    clock,
    invitationAttemptLimiter: new InMemoryAttemptLimiter(),
  });
  return { app, invitationsRepository, sessions };
}

/** Valor de la cookie de sesión emitida en la respuesta. */
function cookieDeSesion(response: request.Response): string | undefined {
  const headers = response.headers['set-cookie'];
  const cookies = Array.isArray(headers) ? headers : [headers];
  const cookie = cookies.find((value) => value?.startsWith('gym_session='));
  return cookie?.split(';')[0]?.split('=')[1];
}

const DATOS_VALIDOS = { displayName: 'Ana Pérez', password: 'ClaveSegura2026' };

describe('Invitations API - HU06', () => {
  describe('GET /invitations/:token (T1 y T6)', () => {
    it('criterio 1: responde OK e informa el correo invitado', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get(`/invitations/${TOKEN_VIGENTE}`)
        .expect(200);

      expect(response.body).toEqual({
        gymName: 'Gimnasio Central',
        email: 'nuevo.alumno@gym.test',
        roles: ['ALUMNO'],
        expiresAt: '2026-09-25T10:00:00.000Z',
        // FL-19/4: quien invita al alumno va a ser su profesor.
        trainerName: 'Lucía Entrenadora',
        // FL-19/3: el texto del consentimiento lo define el servidor.
        healthConsentText: expect.stringContaining('datos de salud'),
      });
    });

    it('criterio 4: busca por el hash del token, nunca por el valor en claro', async () => {
      const { app, invitationsRepository } = buildApp();

      await request(app).get(`/invitations/${TOKEN_VIGENTE}`).expect(200);

      expect(invitationsRepository.findByTokenHash).toHaveBeenCalledWith(
        hashearToken(TOKEN_VIGENTE),
      );
    });

    it('criterio 3: un token inexistente y uno alterado responden igual', async () => {
      const { app } = buildApp();

      const inexistente = await request(app)
        .get('/invitations/no-existe-este-token')
        .expect(404);
      const alterado = await request(app)
        .get(`/invitations/${TOKEN_VIGENTE.slice(0, -1)}X`)
        .expect(404);

      expect(inexistente.body).toEqual(alterado.body);
      expect(inexistente.body).toEqual({
        error: 'invitation_not_found',
        code: 'INVALIDA',
        message: 'El enlace de invitación no es válido',
      });
    });

    it.each([
      [TOKEN_USADO, 409, 'invitation_already_used', 'USADA'],
      [TOKEN_REVOCADO, 410, 'invitation_revoked', 'REVOCADA'],
      [TOKEN_VENCIDO, 410, 'invitation_expired', 'VENCIDA'],
    ])(
      'criterio 2: %s se rechaza con código distinguible',
      async (token, status, error, code) => {
        const { app } = buildApp();

        const response = await request(app)
          .get(`/invitations/${token}`)
          .expect(status);

        expect(response.body.error).toBe(error);
        expect(response.body.code).toBe(code);
      },
    );
  });

  describe('POST /invitations/:token/complete (T2, T3 y T4)', () => {
    it('T2 y T3: crea la cuenta y deja la sesión abierta por cookie', async () => {
      const { app, invitationsRepository, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send(DATOS_VALIDOS)
        .expect(201);

      expect(response.body).toEqual({
        user: { id: USER_ID, gymId: GYM_ID, roles: ['ALUMNO'] },
        expiresAt: '2026-10-21T10:00:00.000Z',
      });
      expect(invitationsRepository.completeAccount).toHaveBeenCalledTimes(1);

      // Criterio 18: el token viaja sólo en la cookie httpOnly (RNF-16).
      expect(response.body).not.toHaveProperty('token');
      const token = cookieDeSesion(response);
      expect(token).toBeTruthy();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.tokenHash).toBe(hashearToken(token ?? ''));

      const cookieHeader = response.headers['set-cookie']?.[0] ?? '';
      expect(cookieHeader).toContain('HttpOnly');
    });

    it('criterio 14: la contraseña se guarda con bcrypt y sal propia', async () => {
      const { app, invitationsRepository } = buildApp();

      await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send(DATOS_VALIDOS)
        .expect(201);
      await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send(DATOS_VALIDOS)
        .expect(201);

      const [primera, segunda] = vi
        .mocked(invitationsRepository.completeAccount)
        .mock.calls.map(([command]) => command.passwordHash);
      expect(primera).not.toBe(DATOS_VALIDOS.password);
      expect(primera?.startsWith('$2')).toBe(true);
      // Misma contraseña, hashes distintos.
      expect(primera).not.toBe(segunda);
    });

    it('FL-19/3: el consentimiento de datos de salud llega al alta, separado', async () => {
      const { app, invitationsRepository } = buildApp();

      await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ ...DATOS_VALIDOS, healthDataConsent: true })
        .expect(201);
      await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send(DATOS_VALIDOS)
        .expect(201);

      const llamadas = vi.mocked(invitationsRepository.completeAccount).mock
        .calls;
      expect(llamadas[0]?.[0].healthDataConsent).toBe(true);
      // Sin marcarlo, la cuenta se crea igual (FL-19/A2).
      expect(llamadas[1]?.[0].healthDataConsent).toBe(false);
    });

    it('criterio 8: los roles del pedido se ignoran', async () => {
      const { app, invitationsRepository } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ ...DATOS_VALIDOS, roles: ['ADMINISTRADOR'] })
        .expect(201);

      expect(response.body.user.roles).toEqual(['ALUMNO']);
      const command = vi.mocked(invitationsRepository.completeAccount).mock
        .calls[0]?.[0];
      expect(command).not.toHaveProperty('roles');
    });

    it('criterio 13: sin nombre ni contraseña responde un error por campo', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: '   ' })
        .expect(400);

      expect(response.body.error).toBe('invalid_request_body');
      expect(response.body.fields.displayName).toEqual([
        'El nombre es obligatorio',
      ]);
      expect(response.body.fields.password).toEqual([
        'La contraseña es obligatoria',
      ]);
    });

    it('criterio 16: rechaza la contraseña débil y dice qué regla incumple', async () => {
      const { app, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'passwordfacil' })
        .expect(422);

      expect(response.body.error).toBe('weak_password');
      expect(response.body.fields.password).toEqual([
        'Debe contener al menos una letra mayúscula.',
        'Debe contener al menos un número.',
      ]);
      expect(sessions).toHaveLength(0);
    });

    it('criterio 17: la contraseña no aparece en la respuesta', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({ displayName: 'Ana Pérez', password: 'debilisima' })
        .expect(422);

      expect(JSON.stringify(response.body)).not.toContain('debilisima');
    });

    it('criterio 5: una invitación vencida no se puede completar por la API', async () => {
      const { app, invitationsRepository, sessions } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_VENCIDO}/complete`)
        .send(DATOS_VALIDOS)
        .expect(410);

      expect(response.body.code).toBe('VENCIDA');
      expect(invitationsRepository.completeAccount).not.toHaveBeenCalled();
      expect(sessions).toHaveLength(0);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('no completa una invitación ya usada', async () => {
      const { app, invitationsRepository } = buildApp();

      const response = await request(app)
        .post(`/invitations/${TOKEN_USADO}/complete`)
        .send(DATOS_VALIDOS)
        .expect(409);

      expect(response.body.code).toBe('USADA');
      expect(invitationsRepository.completeAccount).not.toHaveBeenCalled();
    });

    it('criterio 19: el sexto intento en un minuto desde el mismo origen se rechaza', async () => {
      const { app } = buildApp();

      for (let intento = 1; intento <= 5; intento += 1) {
        await request(app)
          .post(`/invitations/${TOKEN_USADO}/complete`)
          .send(DATOS_VALIDOS)
          .expect(409);
      }

      const sexto = await request(app)
        .post(`/invitations/${TOKEN_USADO}/complete`)
        .send(DATOS_VALIDOS)
        .expect(429);

      expect(sexto.body.error).toBe('too_many_attempts');
      expect(sexto.headers['retry-after']).toBeDefined();
    });
  });
});
