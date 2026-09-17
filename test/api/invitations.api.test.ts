import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  CompleteAccountCommand,
  CompletedAccountResult,
  InvitationRecord,
  InvitationsRepository,
} from '../../src/modules/invitations/application/ports/invitations.repository';
import { JwtTokenService } from '../../src/modules/invitations/domain/services/jwt-token.service';

const TOKEN_VIGENTE = 'e48ca620-13d8-4f24-9b59-7b70743b1790';
const TOKEN_USADO = 'e48ca620-13d8-4f24-9b59-7b70743b1791';
const TOKEN_REVOCADO = 'e48ca620-13d8-4f24-9b59-7b70743b1792';
const TOKEN_EXPIRADO = 'e48ca620-13d8-4f24-9b59-7b70743b1793';

const now = new Date('2026-09-16T12:00:00Z');
const clock = { now: () => now };

function sampleInvitation(
  id: string,
  status: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA' = 'VIGENTE',
  expiresAt: Date = new Date('2026-09-20T12:00:00Z'),
): InvitationRecord {
  return {
    id,
    gymId: 'gym-uuid-001',
    gymName: 'Power Gym',
    issuedByUserId: 'trainer-uuid-001',
    issuedByUserRoles: ['ENTRENADOR'],
    emailNormalized: 'nuevo.alumno@example.com',
    status,
    issuedAt: new Date('2026-09-10T12:00:00Z'),
    expiresAt,
    roles: ['ALUMNO'],
  };
}

function buildApp(records: Record<string, InvitationRecord> = {}) {
  const invitationsRepository: InvitationsRepository = {
    findByToken: vi.fn().mockImplementation(async (token: string) => {
      return records[token] ?? null;
    }),
    completeAccount: vi
      .fn()
      .mockImplementation(async (command: CompleteAccountCommand): Promise<CompletedAccountResult> => {
        const inv = records[command.invitationId];
        return {
          userId: 'user-uuid-new',
          gymId: inv?.gymId ?? 'gym-uuid-001',
          email: inv?.emailNormalized ?? 'nuevo.alumno@example.com',
          displayName: command.displayName,
          roles: inv?.roles ?? ['ALUMNO'],
        };
      }),
  };

  const app = createApp({ invitationsRepository, clock });
  return { app, invitationsRepository };
}

describe('Invitations API - HU06', () => {
  const defaultRecords: Record<string, InvitationRecord> = {
    [TOKEN_VIGENTE]: sampleInvitation(TOKEN_VIGENTE, 'VIGENTE'),
    [TOKEN_USADO]: sampleInvitation(TOKEN_USADO, 'USADA'),
    [TOKEN_REVOCADO]: sampleInvitation(TOKEN_REVOCADO, 'REVOCADA'),
    [TOKEN_EXPIRADO]: sampleInvitation(
      TOKEN_EXPIRADO,
      'VIGENTE',
      new Date('2026-09-10T00:00:00Z'), // Expirado antes de now
    ),
  };

  describe('GET /invitations/:token (T1, T6)', () => {
    it('retorna 200 con los datos públicos para una invitación vigente', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .get(`/invitations/${TOKEN_VIGENTE}`)
        .expect(200);

      expect(response.body).toEqual({
        id: TOKEN_VIGENTE,
        gymId: 'gym-uuid-001',
        gymName: 'Power Gym',
        email: 'nuevo.alumno@example.com',
        roles: ['ALUMNO'],
        expiresAt: new Date('2026-09-20T12:00:00Z').toISOString(),
      });
    });

    it('retorna 404 si el token no existe', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .get('/invitations/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error).toBe('invitation_not_found');
    });

    it('retorna 409 con mensaje claro si la invitación ya fue usada (T6)', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .get(`/invitations/${TOKEN_USADO}`)
        .expect(409);

      expect(response.body.error).toBe('invitation_already_used');
      expect(response.body.message).toBe('Esta invitación ya fue utilizada');
    });

    it('retorna 410 con mensaje claro si la invitación fue revocada (T6)', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .get(`/invitations/${TOKEN_REVOCADO}`)
        .expect(410);

      expect(response.body.error).toBe('invitation_revoked');
      expect(response.body.message).toBe('La invitación ha sido revocada');
    });

    it('retorna 410 con mensaje claro si la invitación está expirada (T6)', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .get(`/invitations/${TOKEN_EXPIRADO}`)
        .expect(410);

      expect(response.body.error).toBe('invitation_expired');
      expect(response.body.message).toBe('La invitación ha caducado');
    });
  });

  describe('POST /invitations/:token/complete (T2, T3, T4)', () => {
    it('retorna 400 si faltan campos en el cuerpo', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('invalid_request_body');
    });

    it('retorna 422 si la contraseña no cumple requisitos de fortaleza (T4)', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({
          displayName: 'Juan Perez',
          password: 'passwordfacil', // sin mayúscula ni número
        })
        .expect(422);

      expect(response.body.error).toBe('weak_password');
      expect(response.body.details).toContain(
        'Debe contener al menos una letra mayúscula.',
      );
      expect(response.body.details).toContain(
        'Debe contener al menos un número.',
      );
    });

    it('retorna 410 si se intenta completar una invitación ya caducada', async () => {
      const { app } = buildApp(defaultRecords);

      const response = await request(app)
        .post(`/invitations/${TOKEN_EXPIRADO}/complete`)
        .send({
          displayName: 'Juan Perez',
          password: 'PasswordSegura2026',
        })
        .expect(410);

      expect(response.body.error).toBe('invitation_expired');
    });

    it('retorna 201 con JWT y datos de usuario al completar exitosamente (T2, T3)', async () => {
      const { app, invitationsRepository } = buildApp(defaultRecords);

      const response = await request(app)
        .post(`/invitations/${TOKEN_VIGENTE}/complete`)
        .send({
          displayName: 'Juan Perez',
          password: 'PasswordSegura2026',
        })
        .expect(201);

      expect(response.body.user).toEqual({
        id: 'user-uuid-new',
        gymId: 'gym-uuid-001',
        email: 'nuevo.alumno@example.com',
        displayName: 'Juan Perez',
        roles: ['ALUMNO'],
      });
      expect(typeof response.body.token).toBe('string');

      // Verifica token JWT emitido
      const decoded = JwtTokenService.verify(response.body.token);
      expect(decoded.sub).toBe('user-uuid-new');
      expect(decoded.email).toBe('nuevo.alumno@example.com');

      expect(invitationsRepository.completeAccount).toHaveBeenCalled();
    });
  });
});
