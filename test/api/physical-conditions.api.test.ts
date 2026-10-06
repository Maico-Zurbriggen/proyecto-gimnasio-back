import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  DeclareConditionCommand,
  PhysicalConditionRecord,
  PhysicalConditionsRepository,
} from '../../src/modules/physical-conditions/application/ports/physical-conditions.repository';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const OTRO_ALUMNO = '20000000-0000-4000-8000-000000000005';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const CONDICION = '40000000-0000-4000-8000-000000000001';

const AHORA = new Date('2026-10-05T12:00:00Z');
const clock = { now: () => AHORA };

function condicion(
  overrides: Partial<PhysicalConditionRecord> = {},
): PhysicalConditionRecord {
  return {
    id: CONDICION,
    studentId: ALUMNO,
    bodyZoneCode: 'RODILLA',
    severity: 'MODERADA',
    description: null,
    startsOn: new Date('2026-09-01T00:00:00Z'),
    endsOn: null,
    ...overrides,
  };
}

interface RepoOptions {
  declared?: PhysicalConditionRecord | null;
  listed?: PhysicalConditionRecord[];
  found?: PhysicalConditionRecord | null;
}

function createRepo(options: RepoOptions = {}) {
  const declarations: DeclareConditionCommand[] = [];
  const closed: { id: string; endsOn: Date }[] = [];

  const repo: PhysicalConditionsRepository = {
    declare: vi.fn(async (command: DeclareConditionCommand) => {
      declarations.push(command);
      if (options.declared === null) {
        return null;
      }
      return (
        options.declared ??
        condicion({
          bodyZoneCode: command.bodyZoneCode,
          severity: command.severity,
          description: command.description,
          startsOn: command.startsOn,
        })
      );
    }),
    listByStudent: vi.fn(async () => options.listed ?? [condicion()]),
    findById: vi.fn(async () =>
      options.found === undefined ? condicion() : options.found,
    ),
    close: vi.fn(async (id: string, endsOn: Date) => {
      closed.push({ id, endsOn });
      return condicion({ endsOn });
    }),
  };

  return { repo, declarations, closed };
}

function comoAlumno(
  app: ReturnType<typeof createApp>,
  metodo: 'post' | 'get',
  ruta: string,
  userId = ALUMNO,
) {
  const req =
    metodo === 'post' ? request(app).post(ruta) : request(app).get(ruta);
  return req.set('x-user-id', userId).set('x-user-roles', 'ALUMNO');
}

describe('Physical conditions API - HU11', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /students/:id/conditions (T1)', () => {
    it('declara una condición con zona corporal y severidad', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      const response = await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions`,
      )
        .send({ bodyZoneCode: 'RODILLA', severity: 'MODERADA' })
        .expect(201);

      expect(response.body.bodyZoneCode).toBe('RODILLA');
      expect(response.body.severity).toBe('MODERADA');
      expect(response.body.vigente).toBe(true);
      expect(declarations).toHaveLength(1);
    });

    it('acepta una articulación y un grupo muscular como zona', async () => {
      const { repo } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'HOMBRO', severity: 'LEVE' })
        .expect(201);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'ISQUIOTIBIALES', severity: 'SEVERA' })
        .expect(201);
    });

    it('RN-10a: rechaza una zona fuera de la enumeración cerrada', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'ESPALDA_BAJA', severity: 'LEVE' })
        .expect(400);

      expect(declarations).toHaveLength(0);
    });

    it('RN-10a: rechaza una severidad inventada', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'GRAVISIMA' })
        .expect(400);

      expect(declarations).toHaveLength(0);
    });

    it('guarda la descripción libre como complementaria', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({
          bodyZoneCode: 'RODILLA',
          severity: 'LEVE',
          description: '  molestia al bajar escaleras  ',
        })
        .expect(201);

      expect(declarations[0]?.description).toBe('molestia al bajar escaleras');
    });

    it('rechaza una fecha de inicio futura', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({
          bodyZoneCode: 'RODILLA',
          severity: 'LEVE',
          startsOn: '2026-10-06',
        })
        .expect(400);

      expect(declarations).toHaveLength(0);
    });

    it('RN-10: varias condiciones pueden declararse a la vez', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'MODERADA' })
        .expect(201);
      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'HOMBRO', severity: 'LEVE' })
        .expect(201);

      expect(declarations).toHaveLength(2);
    });

    it('404 cuando el alumno no existe', async () => {
      const { repo } = createRepo({ declared: null });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'LEVE' })
        .expect(404);
    });

    it('RNF-14: un alumno no declara condiciones de otro', async () => {
      const { repo, declarations } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(app, 'post', `/students/${OTRO_ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'LEVE' })
        .expect(403);

      expect(declarations).toHaveLength(0);
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await request(app)
        .post(`/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'LEVE' })
        .expect(401);
    });
  });

  describe('GET /students/:id/conditions (T2)', () => {
    const historial = [
      condicion({ id: 'c1', startsOn: new Date('2026-09-01T00:00:00Z') }),
      condicion({
        id: 'c2',
        bodyZoneCode: 'HOMBRO',
        startsOn: new Date('2026-08-01T00:00:00Z'),
        endsOn: new Date('2026-09-15T00:00:00Z'),
      }),
    ];

    it('devuelve el historial con la vigencia de cada condición', async () => {
      const { repo } = createRepo({ listed: historial });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      const response = await comoAlumno(
        app,
        'get',
        `/students/${ALUMNO}/conditions`,
      ).expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].vigente).toBe(true);
      expect(response.body[1].vigente).toBe(false);
      expect(response.body[1].endsOn).toBe('2026-09-15');
    });

    it('RF-085: responde qué condiciones regían en una fecha pasada', async () => {
      const { repo } = createRepo({ listed: historial });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      const response = await comoAlumno(
        app,
        'get',
        `/students/${ALUMNO}/conditions?vigentesEn=2026-09-10`,
      ).expect(200);

      // El 10 de septiembre las dos regían, aunque hoy una esté cerrada.
      expect(response.body).toHaveLength(2);
    });

    it('rechaza una fecha de consulta mal formada', async () => {
      const { repo } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'get',
        `/students/${ALUMNO}/conditions?vigentesEn=10-09-2026`,
      ).expect(400);
    });

    it('el entrenador puede consultar las condiciones del alumno', async () => {
      const { repo } = createRepo({ listed: historial });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await request(app)
        .get(`/students/${ALUMNO}/conditions`)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(200);
    });

    it('RNF-14: un alumno no consulta las de otro', async () => {
      const { repo } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'get',
        `/students/${OTRO_ALUMNO}/conditions`,
      ).expect(403);
    });
  });

  describe('POST /students/:id/conditions/:conditionId/close (T2)', () => {
    it('cierra una condición vigente', async () => {
      const { repo, closed } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      const response = await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(200);

      expect(response.body.endsOn).toBe('2026-10-05');
      expect(closed).toHaveLength(1);
    });

    it('acepta una fecha de cierre explícita', async () => {
      const { repo, closed } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({ endsOn: '2026-09-20' })
        .expect(200);

      expect(closed[0]?.endsOn.toISOString()).toBe('2026-09-20T00:00:00.000Z');
    });

    it('no cierra una condición ya cerrada', async () => {
      const { repo, closed } = createRepo({
        found: condicion({ endsOn: new Date('2026-09-15T00:00:00Z') }),
      });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(409);

      expect(closed).toHaveLength(0);
    });

    it('RI-17: no cierra antes de la fecha de inicio', async () => {
      const { repo, closed } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({ endsOn: '2026-08-01' })
        .expect(409);

      expect(closed).toHaveLength(0);
    });

    it('404 cuando la condición no existe o es de otro alumno', async () => {
      const { repo } = createRepo({ found: null });
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(404);
    });

    it('RNF-14: un alumno no cierra condiciones de otro', async () => {
      const { repo, closed } = createRepo();
      const app = createApp({ physicalConditionsRepository: repo, clock });

      await comoAlumno(
        app,
        'post',
        `/students/${OTRO_ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(403);

      expect(closed).toHaveLength(0);
    });
  });
});
