import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';
import type {
  InvitationEmail,
  InvitationMailer,
} from '../../src/modules/invitations/application/ports/invitation-mailer';
import type {
  InvitationsRepository,
  IssueInvitationCommand,
  IssuedInvitation,
} from '../../src/modules/invitations/application/ports/invitations.repository';

const GYM = '10000000-0000-4000-8000-000000000001';
const TRAINER = '21000000-0000-4000-8000-000000000002';
const ADMIN = '21000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-12T12:00:00Z');
const INVITACION = '31000000-0000-4000-8000-000000000099';

const entrenadora = {
  'x-user-id': TRAINER,
  'x-user-roles': 'ENTRENADOR',
  'x-gym-id': GYM,
};
const administradora = {
  'x-user-id': ADMIN,
  'x-user-roles': 'ADMINISTRADOR',
  'x-gym-id': GYM,
};

function buildApp({
  mailFails = false,
  conflict,
  estadoGuardado = 'VIGENTE',
}: {
  mailFails?: boolean;
  estadoGuardado?: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA';
  conflict?: 'EMAIL_YA_REGISTRADO' | 'INVITACION_VIGENTE_EXISTENTE';
} = {}) {
  const confirmed: IssueInvitationCommand[] = [];
  const rotados: string[] = [];
  const sent: InvitationEmail[] = [];
  const invitationsRepository: InvitationsRepository = {
    findByTokenHash: vi.fn(() => Promise.resolve(null)),
    completeAccount: vi.fn(() => Promise.reject(new Error('no usado'))),
    list: vi.fn(() => Promise.resolve([])),
    findIssuedById: vi.fn((id: string, gymId: string) =>
      Promise.resolve(
        id === INVITACION && gymId === GYM
          ? {
              id: INVITACION,
              issuedByUserId: TRAINER,
              emailNormalized: 'ana@test.com',
              roles: ['ALUMNO' as const],
              status: estadoGuardado,
              issuedAt: new Date('2026-10-10T12:00:00Z'),
              expiresAt: new Date('2026-10-24T12:00:00Z'),
              issuedByName: 'Lucía',
            }
          : null,
      ),
    ),
    revoke: vi.fn(() => Promise.resolve(estadoGuardado === 'VIGENTE')),
    rotateToken: vi.fn(
      (command: { tokenHash: string }): Promise<IssuedInvitation | null> => {
        rotados.push(command.tokenHash);
        return Promise.resolve({
          id: INVITACION,
          gymName: 'Gimnasio Test Norte',
          emailNormalized: 'ana@test.com',
          roles: ['ALUMNO'],
          expiresAt: new Date('2026-10-24T12:00:00Z'),
          trainerName: 'Lucía',
        });
      },
    ),
    issue: vi.fn(
      async (
        command: IssueInvitationCommand,
        beforeCommit: (issued: IssuedInvitation) => Promise<void>,
      ) => {
        if (conflict) return conflict;
        const issued: IssuedInvitation = {
          id: '31000000-0000-4000-8000-000000000099',
          gymName: 'Gimnasio Test Norte',
          emailNormalized: command.emailNormalized,
          roles: command.roles,
          expiresAt: command.expiresAt,
          trainerName: command.issuedByUserId === TRAINER ? 'Lucía' : null,
        };
        await beforeCommit(issued);
        confirmed.push(command);
        return issued;
      },
    ),
  };
  const invitationMailer: InvitationMailer = {
    sendInvitation: vi.fn((email: InvitationEmail) => {
      if (mailFails) return Promise.reject(new Error('down'));
      sent.push(email);
      return Promise.resolve();
    }),
  };
  const app = createApp({
    invitationsRepository,
    invitationMailer,
    clock: { now: () => AHORA },
  });
  return { app, confirmed, sent, rotados, invitationsRepository };
}

describe('Emisión de invitaciones (FL-19)', () => {
  it('la entrenadora invita a un alumno: el correo lleva el enlace y su nombre', async () => {
    const { app, confirmed, sent } = buildApp();

    const response = await request(app)
      .post('/invitations')
      .set(entrenadora)
      .send({ email: '  Nuevo.Alumno@Test.com ' })
      .expect(201);

    expect(response.body).toEqual({
      id: '31000000-0000-4000-8000-000000000099',
      email: 'nuevo.alumno@test.com',
      roles: ['ALUMNO'],
      status: 'VIGENTE',
      issuedAt: '2026-10-12T12:00:00.000Z',
      expiresAt: '2026-10-26T12:00:00.000Z',
      trainerName: 'Lucía',
      emailFailed: false,
    });
    expect(sent[0]).toMatchObject({
      to: 'nuevo.alumno@test.com',
      trainerName: 'Lucía',
      roles: ['ALUMNO'],
    });
    // El token viaja sólo en el correo; la base recibe su hash.
    expect(confirmed[0]?.tokenHash).toBe(hashearToken(sent[0]?.token ?? ''));
    expect(JSON.stringify(response.body)).not.toContain(sent[0]?.token);
    expect(confirmed[0]?.gymId).toBe(GYM);
  });

  it('un entrenador no puede invitar con otros roles', async () => {
    const { app, confirmed } = buildApp();

    const response = await request(app)
      .post('/invitations')
      .set(entrenadora)
      .send({ email: 'otro@test.com', roles: ['ENTRENADOR'] })
      .expect(403);

    expect(response.body.error).toBe('forbidden_role');
    expect(confirmed).toHaveLength(0);
  });

  it('el administrador puede invitar entrenadores', async () => {
    const { app, sent } = buildApp();

    await request(app)
      .post('/invitations')
      .set(administradora)
      .send({ email: 'coach@test.com', roles: ['ENTRENADOR'] })
      .expect(201);

    expect(sent[0]?.trainerName).toBeNull();
  });

  it('alumnos, SuperAdmin y visitantes no emiten invitaciones', async () => {
    const { app } = buildApp();

    await request(app)
      .post('/invitations')
      .send({ email: 'x@test.com' })
      .expect(401);
    for (const role of ['ALUMNO', 'SUPERADMIN']) {
      await request(app)
        .post('/invitations')
        .set({ ...entrenadora, 'x-user-roles': role })
        .send({ email: 'x@test.com' })
        .expect(403);
    }
  });

  it('criterio 18: si el correo no sale, la invitación queda VIGENTE y se avisa', async () => {
    const { app, confirmed } = buildApp({ mailFails: true });

    const response = await request(app)
      .post('/invitations')
      .set(entrenadora)
      .send({ email: 'x@test.com' })
      .expect(201);

    expect(response.body).toMatchObject({
      status: 'VIGENTE',
      emailFailed: true,
    });
    expect(confirmed).toHaveLength(1);
  });

  it.each([
    ['EMAIL_YA_REGISTRADO', 'email_already_registered'],
    ['INVITACION_VIGENTE_EXISTENTE', 'pending_invitation_exists'],
  ] as const)('%s responde 409 en el campo email', async (conflict, error) => {
    const { app } = buildApp({ conflict });

    const response = await request(app)
      .post('/invitations')
      .set(entrenadora)
      .send({ email: 'x@test.com' })
      .expect(409);

    expect(response.body.error).toBe(error);
    expect(response.body.fields.email).toBeDefined();
  });

  it('valida el formato del correo por campo', async () => {
    const { app } = buildApp();

    const response = await request(app)
      .post('/invitations')
      .set(entrenadora)
      .send({ email: 'no-es-correo' })
      .expect(400);

    expect(response.body.fields.email).toEqual([
      'El correo no tiene un formato válido',
    ]);
  });

  it('el entrenador lista sólo las suyas; el administrador, las del gimnasio', async () => {
    const { app, invitationsRepository } = buildApp();

    await request(app).get('/invitations').set(entrenadora).expect(200);
    await request(app).get('/invitations').set(administradora).expect(200);

    expect(invitationsRepository.list).toHaveBeenNthCalledWith(1, {
      gymId: GYM,
      issuedByUserId: TRAINER,
    });
    expect(invitationsRepository.list).toHaveBeenNthCalledWith(2, {
      gymId: GYM,
      issuedByUserId: undefined,
    });
  });
});

describe('Revocación y reenvío (HU08 - T2 y T4)', () => {
  it('criterio 19: reenviar rota el token y manda el enlace nuevo', async () => {
    const { app, sent, rotados } = buildApp();

    const response = await request(app)
      .post(`/invitations/${INVITACION}/resend`)
      .set(entrenadora)
      .expect(200);

    expect(response.body.emailFailed).toBe(false);
    expect(rotados).toHaveLength(1);
    expect(rotados[0]).toBe(hashearToken(sent[0]?.token ?? ''));
  });

  it('criterio 12: no se revoca ni se reenvía una invitación usada, y se dice por qué', async () => {
    const { app } = buildApp({ estadoGuardado: 'USADA' });

    const revocar = await request(app)
      .delete(`/invitations/${INVITACION}`)
      .set(entrenadora)
      .expect(409);
    expect(revocar.body).toMatchObject({
      error: 'invitation_not_revocable',
      estado: 'USADA',
    });

    await request(app)
      .post(`/invitations/${INVITACION}/resend`)
      .set(entrenadora)
      .expect(409);
  });

  it('criterio 13: otro entrenador no revoca ni reenvía', async () => {
    const { app } = buildApp();
    const otro = {
      ...entrenadora,
      'x-user-id': '21000000-0000-4000-8000-000000000003',
    };

    await request(app)
      .delete(`/invitations/${INVITACION}`)
      .set(otro)
      .expect(403);
    await request(app)
      .post(`/invitations/${INVITACION}/resend`)
      .set(otro)
      .expect(403);
  });

  it('el administrador revoca una invitación vigente', async () => {
    const { app } = buildApp();
    await request(app)
      .delete(`/invitations/${INVITACION}`)
      .set(administradora)
      .expect(204);
  });

  it('criterio 16: una invitación de otro gimnasio responde genérico', async () => {
    const { app } = buildApp();
    await request(app)
      .delete('/invitations/31000000-0000-4000-8000-000000000123')
      .set(administradora)
      .expect(404);
  });
});
