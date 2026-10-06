import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { EmailSender } from '../../src/modules/invitations/application/ports/email-sender.port';
import type {
  CreateInvitationCommand,
  InvitationsRepository,
  IssuedInvitationRecord,
} from '../../src/modules/invitations/application/ports/invitations.repository';

const GYM = '10000000-0000-4000-8000-000000000001';
const OTRO_GYM = '10000000-0000-4000-8000-000000000009';
const ADMIN = '20000000-0000-4000-8000-000000000001';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const OTRO_ENTRENADOR = '20000000-0000-4000-8000-000000000003';
const ALUMNO = '20000000-0000-4000-8000-000000000004';
const INVITACION = '30000000-0000-4000-8000-000000000001';

const AHORA = new Date('2026-10-05T12:00:00Z');
const clock = { now: () => AHORA };

function invitacion(
  overrides: Partial<IssuedInvitationRecord> = {},
): IssuedInvitationRecord {
  return {
    id: INVITACION,
    gymId: GYM,
    emailNormalized: 'nuevo@gym.test',
    status: 'VIGENTE',
    issuedAt: AHORA,
    expiresAt: new Date('2026-10-19T12:00:00Z'),
    roles: ['ALUMNO'],
    issuedByUserId: ENTRENADOR,
    issuedByName: 'Lucía Entrenadora',
    ...overrides,
  };
}

interface RepoOptions {
  createResult?:
    | IssuedInvitationRecord
    | 'EMAIL_YA_REGISTRADO'
    | 'INVITACION_VIGENTE_EXISTENTE';
  found?: IssuedInvitationRecord | null;
  listed?: IssuedInvitationRecord[];
}

function createRepo(options: RepoOptions = {}) {
  const created: CreateInvitationCommand[] = [];
  const revoked: string[] = [];
  const audits: { operation: string; actorUserId: string }[] = [];
  const listFilters: { gymId: string; issuedByUserId?: string }[] = [];

  const repo = {
    findByToken: vi.fn(async () => null),
    completeAccount: vi.fn(),
    create: vi.fn(async (command: CreateInvitationCommand) => {
      created.push(command);
      return options.createResult ?? invitacion();
    }),
    findById: vi.fn(async () =>
      options.found === undefined ? invitacion() : options.found,
    ),
    list: vi.fn(async (filtro: { gymId: string; issuedByUserId?: string }) => {
      listFilters.push(filtro);
      return options.listed ?? [invitacion()];
    }),
    revoke: vi.fn(async (id: string) => {
      revoked.push(id);
    }),
    recordAudit: vi.fn(
      async (entry: { operation: string; actorUserId: string }) => {
        audits.push(entry);
      },
    ),
  } as unknown as InvitationsRepository;

  return { repo, created, revoked, audits, listFilters };
}

function buildApp(
  repo: InvitationsRepository,
  emailSender: EmailSender | null = { sendInvitation: vi.fn() },
) {
  return createApp({ invitationsRepository: repo, emailSender, clock });
}

function como(
  app: ReturnType<typeof createApp>,
  metodo: 'post' | 'get',
  ruta: string,
  userId: string,
  roles: string,
) {
  const req =
    metodo === 'post' ? request(app).post(ruta) : request(app).get(ruta);
  return req
    .set('x-user-id', userId)
    .set('x-user-roles', roles)
    .set('x-gym-id', GYM);
}

describe('Invitations API - HU08 (emisión)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /invitations (T1)', () => {
    it('criterio 1: un administrador emite con varios roles y queda VIGENTE', async () => {
      const { repo, created } = createRepo({
        createResult: invitacion({ roles: ['ALUMNO', 'ENTRENADOR'] }),
      });

      const response = await como(
        buildApp(repo),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO', 'ENTRENADOR'] })
        .expect(201);

      expect(response.body.status).toBe('VIGENTE');
      expect(created).toHaveLength(1);
    });

    it('criterio 2: un entrenador no puede emitir con rol ENTRENADOR', async () => {
      const { repo, created } = createRepo();

      await como(
        buildApp(repo),
        'post',
        '/invitations',
        ENTRENADOR,
        'ENTRENADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ENTRENADOR'] })
        .expect(403);

      expect(created).toHaveLength(0);
    });

    it('criterio 2: ni colando ADMINISTRADOR junto a ALUMNO', async () => {
      const { repo, created } = createRepo();

      await como(
        buildApp(repo),
        'post',
        '/invitations',
        ENTRENADOR,
        'ENTRENADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO', 'ADMINISTRADOR'] })
        .expect(403);

      expect(created).toHaveLength(0);
    });

    it('un entrenador sí puede emitir con rol ALUMNO', async () => {
      const { repo } = createRepo();

      await como(
        buildApp(repo),
        'post',
        '/invitations',
        ENTRENADOR,
        'ENTRENADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);
    });

    it('criterio 3: un alumno no puede emitir invitaciones', async () => {
      const { repo, created } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ALUMNO, 'ALUMNO')
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(403);

      expect(created).toHaveLength(0);
    });

    it('criterio 4: sin sesión responde 401', async () => {
      const { repo } = createRepo();

      await request(buildApp(repo))
        .post('/invitations')
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(401);
    });

    it('criterio 5: el gimnasio sale del emisor, no del cuerpo', async () => {
      const { repo, created } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({
          email: 'nuevo@gym.test',
          roles: ['ALUMNO'],
          gymId: OTRO_GYM,
        })
        .expect(201);

      expect(created[0]?.gymId).toBe(GYM);
    });

    it('criterio 6: el vencimiento queda a 14 días de la emisión', async () => {
      const { repo, created } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);

      expect(created[0]?.expiresAt.toISOString()).toBe(
        '2026-10-19T12:00:00.000Z',
      );
    });

    it('criterio 7: rechaza un correo inválido o vacío', async () => {
      const { repo, created } = createRepo();
      const app = buildApp(repo);

      await como(app, 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: 'no-es-un-correo', roles: ['ALUMNO'] })
        .expect(400);

      await como(app, 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: '', roles: ['ALUMNO'] })
        .expect(400);

      expect(created).toHaveLength(0);
    });

    it('criterio 7: rechaza una invitación sin ningún rol', async () => {
      const { repo, created } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: 'nuevo@gym.test', roles: [] })
        .expect(400);

      expect(created).toHaveLength(0);
    });

    it('criterio 8: normaliza el correo antes de guardarlo', async () => {
      const { repo, created } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: '  NUEVO@Gym.Test  ', roles: ['ALUMNO'] })
        .expect(201);

      expect(created[0]?.emailNormalized).toBe('nuevo@gym.test');
    });

    it('criterio 9: rechaza si el correo ya tiene cuenta', async () => {
      const { repo } = createRepo({ createResult: 'EMAIL_YA_REGISTRADO' });

      const response = await como(
        buildApp(repo),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'existente@gym.test', roles: ['ALUMNO'] })
        .expect(409);

      expect(response.body.error).toBe('email_already_registered');
    });

    it('criterio 9: rechaza si ya hay una invitación vigente', async () => {
      const { repo } = createRepo({
        createResult: 'INVITACION_VIGENTE_EXISTENTE',
      });

      const response = await como(
        buildApp(repo),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'pendiente@gym.test', roles: ['ALUMNO'] })
        .expect(409);

      expect(response.body.error).toBe('pending_invitation_exists');
    });

    it('criterio 21: la emisión queda en auditoría', async () => {
      const { repo, audits } = createRepo();

      await como(buildApp(repo), 'post', '/invitations', ADMIN, 'ADMINISTRADOR')
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);

      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorUserId: ADMIN,
        operation: 'EMISION_INVITACION',
      });
    });
  });

  describe('POST /invitations (T4, envío de correo)', () => {
    it('criterio 17: envía el correo con el enlace del alta', async () => {
      const sendInvitation = vi.fn();
      const { repo } = createRepo();

      await como(
        buildApp(repo, { sendInvitation }),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);

      expect(sendInvitation).toHaveBeenCalledOnce();
      const email = sendInvitation.mock.calls[0]?.[0] as {
        to: string;
        invitationUrl: string;
      };
      expect(email.to).toBe('nuevo@gym.test');
      expect(email.invitationUrl).toContain(INVITACION);
    });

    it('criterio 18: si el envío falla, la invitación sigue emitida', async () => {
      const { repo } = createRepo();
      const sendInvitation = vi.fn().mockRejectedValue(new Error('SMTP caído'));

      const response = await como(
        buildApp(repo, { sendInvitation }),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);

      expect(response.body.status).toBe('VIGENTE');
      expect(response.body.emailFailed).toBe(true);
    });

    it('sin SMTP configurado la invitación se emite igual', async () => {
      const { repo } = createRepo();

      const response = await como(
        buildApp(repo, null),
        'post',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      )
        .send({ email: 'nuevo@gym.test', roles: ['ALUMNO'] })
        .expect(201);

      expect(response.body.emailFailed).toBe(true);
    });
  });

  describe('POST /invitations/:id/revoke (T2)', () => {
    it('criterio 11: una invitación vigente se revoca', async () => {
      const { repo, revoked } = createRepo();

      await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ADMIN,
        'ADMINISTRADOR',
      ).expect(204);

      expect(revoked).toEqual([INVITACION]);
    });

    it('criterio 12: no se revoca una ya usada', async () => {
      const { repo, revoked } = createRepo({
        found: invitacion({ status: 'USADA' }),
      });

      const response = await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ADMIN,
        'ADMINISTRADOR',
      ).expect(409);

      expect(response.body.error).toBe('invitation_not_revocable');
      expect(response.body.estado).toBe('USADA');
      expect(revoked).toHaveLength(0);
    });

    it('criterio 12: no se revoca una vencida', async () => {
      const { repo } = createRepo({
        found: invitacion({ expiresAt: new Date('2026-09-01T00:00:00Z') }),
      });

      const response = await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ADMIN,
        'ADMINISTRADOR',
      ).expect(409);

      expect(response.body.estado).toBe('CADUCADA');
    });

    it('criterio 13: el emisor puede revocar la suya', async () => {
      const { repo, revoked } = createRepo();

      await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(204);

      expect(revoked).toEqual([INVITACION]);
    });

    it('criterio 13: otro entrenador recibe 403', async () => {
      const { repo, revoked } = createRepo();

      await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        OTRO_ENTRENADOR,
        'ENTRENADOR',
      ).expect(403);

      expect(revoked).toHaveLength(0);
    });

    it('criterio 16: una invitación de otro gimnasio responde 404 genérico', async () => {
      const { repo } = createRepo({ found: null });

      const response = await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ADMIN,
        'ADMINISTRADOR',
      ).expect(404);

      expect(response.body.error).toBe('invitation_not_found');
    });

    it('criterio 21: la revocación queda en auditoría', async () => {
      const { repo, audits } = createRepo();

      await como(
        buildApp(repo),
        'post',
        `/invitations/${INVITACION}/revoke`,
        ADMIN,
        'ADMINISTRADOR',
      ).expect(204);

      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actorUserId: ADMIN,
        operation: 'REVOCACION_INVITACION',
      });
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();

      await request(buildApp(repo))
        .post(`/invitations/${INVITACION}/revoke`)
        .expect(401);
    });
  });

  describe('GET /invitations (T3)', () => {
    it('criterio 14: el administrador ve todas las del gimnasio', async () => {
      const { repo, listFilters } = createRepo();

      await como(
        buildApp(repo),
        'get',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      ).expect(200);

      expect(listFilters[0]).toEqual({ gymId: GYM, issuedByUserId: undefined });
    });

    it('criterio 14: el entrenador sólo ve las que emitió', async () => {
      const { repo, listFilters } = createRepo();

      await como(
        buildApp(repo),
        'get',
        '/invitations',
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(200);

      expect(listFilters[0]).toEqual({
        gymId: GYM,
        issuedByUserId: ENTRENADOR,
      });
    });

    it('criterio 15: expone correo, roles, emisor, emisión, vencimiento y estado', async () => {
      const { repo } = createRepo();

      const response = await como(
        buildApp(repo),
        'get',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      ).expect(200);

      expect(response.body[0]).toMatchObject({
        email: 'nuevo@gym.test',
        roles: ['ALUMNO'],
        issuedByName: 'Lucía Entrenadora',
        status: 'VIGENTE',
      });
      expect(response.body[0].issuedAt).toBeDefined();
      expect(response.body[0].expiresAt).toBeDefined();
    });

    it('criterio 15: el estado CADUCADA se deriva del vencimiento', async () => {
      const { repo } = createRepo({
        listed: [invitacion({ expiresAt: new Date('2026-09-01T00:00:00Z') })],
      });

      const response = await como(
        buildApp(repo),
        'get',
        '/invitations',
        ADMIN,
        'ADMINISTRADOR',
      ).expect(200);

      // Guardada como VIGENTE, pero su plazo pasó: se informa CADUCADA sin que
      // ningún proceso la haya actualizado.
      expect(response.body[0].status).toBe('CADUCADA');
    });

    it('criterio 3: un alumno no accede al listado', async () => {
      const { repo } = createRepo();

      await como(
        buildApp(repo),
        'get',
        '/invitations',
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();

      await request(buildApp(repo)).get('/invitations').expect(401);
    });
  });
});
