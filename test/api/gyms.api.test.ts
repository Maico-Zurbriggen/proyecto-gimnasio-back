import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  BeforeCommit,
  GymSummaryRecord,
  GymsRepository,
  ProvisionGymCommand,
  ProvisionedGym,
  ReissueBootstrapCommand,
  ReissuedInvitation,
} from '../../src/modules/gyms/application/ports/gyms.repository';
import type {
  BootstrapInvitationEmail,
  InvitationMailer,
} from '../../src/modules/gyms/application/ports/invitation-mailer';
import type { TimezoneCatalog } from '../../src/modules/gyms/application/ports/timezone-catalog';
import { hashearToken } from '../../src/modules/auth/domain/services/session-token';

const SUPERADMIN_ID = '90000000-0000-4000-8000-000000000001';
const GYM_ID = '10000000-0000-4000-8000-000000000099';
const AHORA = new Date('2026-10-12T12:00:00Z');

const superAdmin = {
  'x-user-id': SUPERADMIN_ID,
  'x-user-roles': 'SUPERADMIN',
  'x-gym-id': '00000000-0000-4000-8000-000000000000',
};

const ALTA = {
  nombre: '  Gimnasio   Norte ',
  zonaHoraria: 'America/Argentina/Cordoba',
  correoAdministrador: '  Primera.Admin@Norte.test ',
};

/**
 * Doble del repositorio que imita la transacción: lo creado sólo queda
 * "confirmado" si el paso previo al commit no lanza.
 */
class FakeGymsRepository implements GymsRepository {
  readonly confirmed: ProvisionGymCommand[] = [];
  readonly reissued: ReissueBootstrapCommand[] = [];
  names = new Set<string>(['gimnasio central']);
  listed: GymSummaryRecord[] = [];
  bootstrapStatus: 'VIGENTE' | 'USADA' | 'REVOCADA' | 'CADUCADA' = 'VIGENTE';

  async provision(
    command: ProvisionGymCommand,
    beforeCommit: BeforeCommit<ProvisionedGym>,
  ): Promise<ProvisionedGym | 'NOMBRE_DUPLICADO'> {
    if (this.names.has(command.name.toLowerCase())) return 'NOMBRE_DUPLICADO';
    const gym: ProvisionedGym = {
      id: GYM_ID,
      name: command.name,
      timezone: command.timezone,
      createdAt: AHORA,
      adminEmail: command.adminEmail,
      invitationExpiresAt: command.invitation.expiresAt,
    };
    await beforeCommit(gym);
    this.names.add(command.name.toLowerCase());
    this.confirmed.push(command);
    return gym;
  }

  list(): Promise<GymSummaryRecord[]> {
    return Promise.resolve(this.listed);
  }

  async reissueBootstrapInvitation(
    command: ReissueBootstrapCommand,
    beforeCommit: BeforeCommit<ReissuedInvitation>,
  ): Promise<ReissuedInvitation | 'YA_USADA' | 'NO_EXISTE'> {
    if (command.gymId !== GYM_ID) return 'NO_EXISTE';
    if (this.bootstrapStatus === 'USADA') return 'YA_USADA';
    const reissued = {
      gymName: 'Gimnasio Norte',
      email: 'primera.admin@norte.test',
      expiresAt: command.invitation.expiresAt,
    };
    await beforeCommit(reissued);
    this.reissued.push(command);
    return reissued;
  }
}

const timezones: TimezoneCatalog = {
  list: () =>
    Promise.resolve([
      'America/Argentina/Buenos_Aires',
      'America/Argentina/Cordoba',
    ]),
  exists: (zone) =>
    Promise.resolve(
      ['America/Argentina/Buenos_Aires', 'America/Argentina/Cordoba'].includes(
        zone,
      ),
    ),
};

function buildApp({ mailFails = false } = {}) {
  const gymsRepository = new FakeGymsRepository();
  const sent: BootstrapInvitationEmail[] = [];
  const invitationMailer: InvitationMailer = {
    sendBootstrapInvitation: vi.fn((email: BootstrapInvitationEmail) => {
      if (mailFails) return Promise.reject(new Error('smtp down'));
      sent.push(email);
      return Promise.resolve();
    }),
  };
  const app = createApp({
    gymsRepository,
    timezoneCatalog: timezones,
    invitationMailer,
    clock: { now: () => AHORA },
  });
  return { app, gymsRepository, sent };
}

describe('Gyms API - HU13', () => {
  describe('permisos (criterio 17)', () => {
    it('sin sesión responde 401', async () => {
      const { app } = buildApp();
      await request(app).post('/platform/gyms').send(ALTA).expect(401);
      await request(app).get('/platform/gyms').expect(401);
    });

    it.each(['ADMINISTRADOR', 'ENTRENADOR', 'ALUMNO'])(
      '%s recibe 403 al crear y al listar',
      async (role) => {
        const { app, gymsRepository } = buildApp();
        const headers = {
          'x-user-id': '21000000-0000-4000-8000-000000000001',
          'x-user-roles': role,
          'x-gym-id': '10000000-0000-4000-8000-000000000001',
        };
        await request(app)
          .post('/platform/gyms')
          .set(headers)
          .send(ALTA)
          .expect(403);
        await request(app).get('/platform/gyms').set(headers).expect(403);
        expect(gymsRepository.confirmed).toHaveLength(0);
      },
    );

    it('criterio 18: el SuperAdmin no accede al detalle de un alumno', async () => {
      const { app } = buildApp();
      await request(app)
        .get('/students/21000000-0000-4000-8000-000000000010/routines')
        .set(superAdmin)
        .expect(403);
    });
  });

  describe('POST /platform/gyms (T1)', () => {
    it('crea el gimnasio con su invitación de arranque y la envía', async () => {
      const { app, gymsRepository, sent } = buildApp();

      const response = await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send(ALTA)
        .expect(201);

      expect(response.body).toEqual({
        id: GYM_ID,
        name: 'Gimnasio Norte',
        timezone: 'America/Argentina/Cordoba',
        createdAt: AHORA.toISOString(),
        invitationSentTo: 'primera.admin@norte.test',
        invitationExpiresAt: '2026-10-26T12:00:00.000Z',
      });

      const command = gymsRepository.confirmed[0];
      expect(command?.actorUserId).toBe(SUPERADMIN_ID);
      // Criterio 9: 14 días desde la emisión, con el reloj del servidor.
      expect(command?.invitation.issuedAt).toEqual(AHORA);
      // El correo lleva el token; la base, sólo su hash.
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe('primera.admin@norte.test');
      expect(command?.invitation.tokenHash).toBe(
        hashearToken(sent[0]?.token ?? ''),
      );
      expect(JSON.stringify(response.body)).not.toContain(sent[0]?.token);
    });

    it('criterio 2: si el correo falla no queda nada creado', async () => {
      const { app, gymsRepository } = buildApp({ mailFails: true });

      const response = await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send(ALTA)
        .expect(502);

      expect(response.body.error).toBe('invitation_delivery_failed');
      expect(gymsRepository.confirmed).toHaveLength(0);
    });

    it('criterio 4: sin datos responde un error por campo', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send({ correoAdministrador: 'no-es-correo' })
        .expect(400);

      expect(Object.keys(response.body.fields).sort()).toEqual([
        'correoAdministrador',
        'nombre',
        'zonaHoraria',
      ]);
    });

    it('criterio 5: una zona inexistente se rechaza en zonaHoraria', async () => {
      const { app, gymsRepository } = buildApp();

      const response = await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send({ ...ALTA, zonaHoraria: 'ZonaInventada' })
        .expect(400);

      expect(response.body.fields.zonaHoraria).toEqual([
        'La zona horaria no es un identificador IANA reconocido',
      ]);
      expect(gymsRepository.confirmed).toHaveLength(0);
    });

    it('criterio 7 y 8: dos altas con el mismo nombre no crean duplicados', async () => {
      const { app, gymsRepository } = buildApp();

      await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send(ALTA)
        .expect(201);
      const segunda = await request(app)
        .post('/platform/gyms')
        .set(superAdmin)
        .send({ ...ALTA, nombre: 'GIMNASIO NORTE' })
        .expect(409);

      expect(segunda.body.error).toBe('gym_name_taken');
      expect(gymsRepository.confirmed).toHaveLength(1);
    });
  });

  describe('gestión (T2)', () => {
    it('criterio 21: lista nombre, zona, estado, fecha y la invitación de arranque', async () => {
      const { app, gymsRepository } = buildApp();
      gymsRepository.listed = [
        {
          id: GYM_ID,
          name: 'Gimnasio Norte',
          timezone: 'America/Argentina/Cordoba',
          active: true,
          createdAt: AHORA,
          administratorCount: 0,
          bootstrapInvitation: {
            email: 'primera.admin@norte.test',
            status: 'VIGENTE',
            issuedAt: new Date('2026-09-01T12:00:00Z'),
            expiresAt: new Date('2026-09-15T12:00:00Z'),
          },
        },
      ];

      const response = await request(app)
        .get('/platform/gyms')
        .set(superAdmin)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: GYM_ID,
          name: 'Gimnasio Norte',
          timezone: 'America/Argentina/Cordoba',
          status: 'ACTIVO',
          createdAt: AHORA.toISOString(),
          administratorCount: 0,
          // VIGENTE en base pero vencida por fecha: se informa VENCIDA.
          bootstrapInvitation: {
            email: 'primera.admin@norte.test',
            status: 'VENCIDA',
            expiresAt: '2026-09-15T12:00:00.000Z',
          },
        },
      ]);
    });

    it('criterio 12: reemite la invitación de arranque no usada', async () => {
      const { app, gymsRepository, sent } = buildApp();

      const response = await request(app)
        .post(`/platform/gyms/${GYM_ID}/bootstrap-invitation`)
        .set(superAdmin)
        .expect(201);

      expect(response.body.invitationSentTo).toBe('primera.admin@norte.test');
      expect(gymsRepository.reissued).toHaveLength(1);
      expect(sent).toHaveLength(1);
    });

    it('no reemite una invitación de arranque ya usada', async () => {
      const { app, gymsRepository } = buildApp();
      gymsRepository.bootstrapStatus = 'USADA';

      const response = await request(app)
        .post(`/platform/gyms/${GYM_ID}/bootstrap-invitation`)
        .set(superAdmin)
        .expect(409);

      expect(response.body.error).toBe('bootstrap_invitation_already_used');
    });

    it('lista las zonas horarias válidas para el selector', async () => {
      const { app } = buildApp();

      const response = await request(app)
        .get('/platform/timezones')
        .set(superAdmin)
        .expect(200);

      expect(response.body).toContain('America/Argentina/Cordoba');
    });
  });
});
