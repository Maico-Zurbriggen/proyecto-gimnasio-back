import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { RoutineRevaluation } from '../../src/modules/physical-conditions/application/ports/routine-revaluation.port';
import { SIN_CAMBIOS } from '../../src/modules/physical-conditions/application/ports/routine-revaluation.port';
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
  /** RN-104: por defecto el alumno ya dio su consentimiento. */
  consent?: boolean;
  declaredNoneAt?: Date | null;
}

function createRepo(options: RepoOptions = {}) {
  const declarations: DeclareConditionCommand[] = [];
  const closed: { id: string; endsOn: Date }[] = [];
  const revisions: {
    id: string;
    cierre: Date;
    nueva: DeclareConditionCommand;
  }[] = [];

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
    revise: vi.fn(
      async (id: string, cierre: Date, nueva: DeclareConditionCommand) => {
        revisions.push({ id, cierre, nueva });
        return {
          cerrada: condicion({ id, endsOn: cierre }),
          vigente: condicion({
            id: '40000000-0000-4000-8000-000000000099',
            bodyZoneCode: nueva.bodyZoneCode,
            severity: nueva.severity,
            description: nueva.description,
            startsOn: nueva.startsOn,
          }),
        };
      },
    ),
    hasHealthConsent: vi.fn(async () => options.consent ?? true),
    findNoConditionsDeclaration: vi.fn(
      async () => options.declaredNoneAt ?? null,
    ),
    declareNoConditions: vi.fn(async () => undefined),
  };

  return { repo, declarations, closed, revisions };
}

/** El entrenador de prueba tiene asignado a ALUMNO y a nadie más. */
function crearApp(
  repo: PhysicalConditionsRepository,
  routineRevaluation?: RoutineRevaluation,
) {
  return createApp({
    physicalConditionsRepository: repo,
    routineRevaluation: routineRevaluation ?? {
      revaluateForStudent: async () => SIN_CAMBIOS,
    },
    clock,
    trainerAssignments: {
      isActive: (trainerId: string, studentId: string) =>
        Promise.resolve(trainerId === ENTRENADOR && studentId === ALUMNO),
    },
  });
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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'HOMBRO', severity: 'LEVE' })
        .expect(201);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'ISQUIOTIBIALES', severity: 'SEVERA' })
        .expect(201);
    });

    it('RN-10a: rechaza una zona fuera de la enumeración cerrada', async () => {
      const { repo, declarations } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'ESPALDA_BAJA', severity: 'LEVE' })
        .expect(400);

      expect(declarations).toHaveLength(0);
    });

    it('RN-10a: rechaza una severidad inventada', async () => {
      const { repo, declarations } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'GRAVISIMA' })
        .expect(400);

      expect(declarations).toHaveLength(0);
    });

    it('guarda la descripción libre como complementaria', async () => {
      const { repo, declarations } = createRepo();
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'LEVE' })
        .expect(404);
    });

    it('RNF-14: un alumno no declara condiciones de otro', async () => {
      const { repo, declarations } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${OTRO_ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'RODILLA', severity: 'LEVE' })
        .expect(403);

      expect(declarations).toHaveLength(0);
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

      await comoAlumno(
        app,
        'get',
        `/students/${ALUMNO}/conditions?vigentesEn=10-09-2026`,
      ).expect(400);
    });

    it('el entrenador puede consultar las condiciones del alumno', async () => {
      const { repo } = createRepo({ listed: historial });
      const app = crearApp(repo);

      await request(app)
        .get(`/students/${ALUMNO}/conditions`)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(200);
    });

    it('RNF-14: un alumno no consulta las de otro', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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
      const app = crearApp(repo);

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

  describe('revisar zona o severidad (criterio 14)', () => {
    const ruta = `/students/${ALUMNO}/conditions/${CONDICION}/revise`;

    it('cambiar la severidad conserva el período anterior en el historial', async () => {
      // La molestia de rodilla se agrava: LEVE hasta hoy, MODERADA desde hoy.
      const { repo, revisions } = createRepo({
        found: condicion({ severity: 'LEVE' }),
      });
      const app = crearApp(repo);

      const response = await comoAlumno(app, 'post', ruta)
        .send({ severity: 'MODERADA' })
        .expect(200);

      // El registro anterior no se sobrescribe: se cierra y queda consultable.
      expect(response.body.anterior.endsOn).toBe('2026-10-05');
      expect(response.body.vigente.severity).toBe('MODERADA');
      expect(response.body.vigente.endsOn).toBeNull();
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.nueva.severity).toBe('MODERADA');
    });

    it('cambiar la zona conserva la severidad que no se tocó', async () => {
      const { repo, revisions } = createRepo({
        found: condicion({ bodyZoneCode: 'RODILLA', severity: 'MODERADA' }),
      });
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ bodyZoneCode: 'TOBILLO' })
        .expect(200);

      expect(revisions[0]?.nueva.bodyZoneCode).toBe('TOBILLO');
      expect(revisions[0]?.nueva.severity).toBe('MODERADA');
    });

    it('la nueva condición empieza el día en que se cierra la anterior', async () => {
      // Sin huecos ni solapamientos: el período viejo termina donde empieza el
      // nuevo, así se sabe siempre qué regía en cada fecha (RF-085).
      const { repo, revisions } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ severity: 'SEVERA' })
        .expect(200);

      expect(revisions[0]?.cierre.toISOString().slice(0, 10)).toBe(
        '2026-10-05',
      );
      expect(revisions[0]?.nueva.startsOn.toISOString().slice(0, 10)).toBe(
        '2026-10-05',
      );
    });

    it('RN-10a: rechaza una zona fuera de la enumeración cerrada', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ bodyZoneCode: 'ALMA' })
        .expect(400);
    });

    it('RN-10a: rechaza una severidad inventada', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ severity: 'CATASTROFICA' })
        .expect(400);
    });

    it('una revisión sin ningún cambio se rechaza', async () => {
      // Cerraría la condición sin motivo y partiría el historial en dos
      // períodos idénticos.
      const { repo, revisions } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta).send({}).expect(400);
      expect(revisions).toHaveLength(0);
    });

    it('no se revisa una condición ya cerrada', async () => {
      const { repo } = createRepo({
        found: condicion({ endsOn: new Date('2026-09-20T00:00:00Z') }),
      });
      const app = crearApp(repo);

      // Su período terminó: no hay nada vigente que corregir.
      await comoAlumno(app, 'post', ruta)
        .send({ severity: 'LEVE' })
        .expect(409);
    });

    it('404 cuando la condición no existe o es de otro alumno', async () => {
      const { repo } = createRepo({ found: null });
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ severity: 'LEVE' })
        .expect(404);
    });

    it('RN-104: sin consentimiento no se revisa', async () => {
      const { repo, revisions } = createRepo({ consent: false });
      const app = crearApp(repo);

      await comoAlumno(app, 'post', ruta)
        .send({ severity: 'LEVE' })
        .expect(403);
      expect(revisions).toHaveLength(0);
    });

    it('RNF-14: un alumno no revisa las condiciones de otro', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

      await comoAlumno(
        app,
        'post',
        `/students/${OTRO_ALUMNO}/conditions/${CONDICION}/revise`,
      )
        .send({ severity: 'LEVE' })
        .expect(403);
    });

    it('criterio 16: el entrenador no revisa condiciones', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

      await request(app)
        .post(ruta)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .send({ severity: 'LEVE' })
        .expect(403);
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();
      const app = crearApp(repo);

      await request(app).post(ruta).send({ severity: 'LEVE' }).expect(401);
    });
  });

  describe('reevaluación de la rutina vigente (criterio 21, RN-91)', () => {
    /** Doble que registra a quién se le reevaluó la rutina. */
    function espiaDeReevaluacion() {
      const llamadas: string[] = [];
      const revaluation: RoutineRevaluation = {
        revaluateForStudent: async (studentId: string) => {
          llamadas.push(studentId);
          return SIN_CAMBIOS;
        },
      };
      return { revaluation, llamadas };
    }

    it('declarar una condición reevalúa la rutina vigente', async () => {
      const { repo } = createRepo();
      const { revaluation, llamadas } = espiaDeReevaluacion();
      const app = crearApp(repo, revaluation);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'HOMBRO', severity: 'MODERADA' })
        .expect(201);

      expect(llamadas).toEqual([ALUMNO]);
    });

    it('cerrar una condición también reevalúa: puede devolver ejercicios a COMPATIBLE', async () => {
      const { repo } = createRepo();
      const { revaluation, llamadas } = espiaDeReevaluacion();
      const app = crearApp(repo, revaluation);

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(200);

      expect(llamadas).toEqual([ALUMNO]);
    });

    it('revisar una condición reevalúa con la severidad nueva', async () => {
      const { repo } = createRepo({ found: condicion({ severity: 'LEVE' }) });
      const { revaluation, llamadas } = espiaDeReevaluacion();
      const app = crearApp(repo, revaluation);

      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/revise`,
      )
        .send({ severity: 'SEVERA' })
        .expect(200);

      expect(llamadas).toEqual([ALUMNO]);
    });

    it('una declaración rechazada no reevalúa nada', async () => {
      const { repo } = createRepo();
      const { revaluation, llamadas } = espiaDeReevaluacion();
      const app = crearApp(repo, revaluation);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'ALMA', severity: 'LEVE' })
        .expect(400);

      expect(llamadas).toEqual([]);
    });

    it('si la reevaluación falla, la condición igual queda declarada', async () => {
      // La declaración es el dato de salud que el alumno pidió registrar.
      // Perderlo porque no se pudo remarcar la rutina sería mucho peor que
      // quedarse con la rutina sin remarcar (RNF-12).
      const { repo } = createRepo();
      const app = crearApp(repo, {
        revaluateForStudent: async () => {
          throw new Error('la base de rutinas no responde');
        },
      });

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions`)
        .send({ bodyZoneCode: 'HOMBRO', severity: 'MODERADA' })
        .expect(201);
    });
  });

  describe('permisos, consentimiento y "ninguna condición" (criterios 7, 8, 16 a 18)', () => {
    const declarar = { bodyZoneCode: 'RODILLA', severity: 'LEVE' };

    it('criterio 16: el entrenador no declara ni cierra condiciones', async () => {
      const app = crearApp(createRepo().repo);
      await request(app)
        .post(`/students/${ALUMNO}/conditions`)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .send(declarar)
        .expect(403);
      await request(app)
        .post(`/students/${ALUMNO}/conditions/${CONDICION}/close`)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .send({})
        .expect(403);
    });

    it('criterio 17: el administrador no accede al detalle', async () => {
      const app = crearApp(createRepo().repo);
      await request(app)
        .get(`/students/${ALUMNO}/conditions`)
        .set('x-user-id', '20000000-0000-4000-8000-000000000001')
        .set('x-user-roles', 'ADMINISTRADOR')
        .expect(403);
    });

    it('criterio 18: un entrenador sin asignación no lee nada', async () => {
      const app = crearApp(createRepo().repo);
      const response = await request(app)
        .get(`/students/${OTRO_ALUMNO}/conditions`)
        .set('x-user-id', ENTRENADOR)
        .set('x-user-roles', 'ENTRENADOR')
        .expect(403);
      expect(JSON.stringify(response.body)).not.toContain('RODILLA');
    });

    it('criterio 7: sin consentimiento no se declara, ni se lee, ni se cierra', async () => {
      const { repo, declarations } = createRepo({ consent: false });
      const app = crearApp(repo);

      const declarado = await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions`,
      )
        .send(declarar)
        .expect(403);
      expect(declarado.body.error).toBe('health_data_consent_required');
      expect(declarations).toHaveLength(0);

      await comoAlumno(app, 'get', `/students/${ALUMNO}/conditions`).expect(
        403,
      );
      await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/${CONDICION}/close`,
      )
        .send({})
        .expect(403);
    });

    it('el estado informa consentimiento y declaración para la pantalla', async () => {
      const app = crearApp(createRepo({ consent: false }).repo);
      const response = await comoAlumno(
        app,
        'get',
        `/students/${ALUMNO}/conditions/status`,
      ).expect(200);
      expect(response.body).toEqual({
        healthDataConsent: false,
        declaredNone: false,
        declaredNoneAt: null,
        activeCount: 0,
      });
    });

    it('criterio 8: declarar "ninguna" queda registrado y es distinto de no responder', async () => {
      const { repo } = createRepo({ listed: [] });
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions/none`)
        .send({})
        .expect(200);
      expect(repo.declareNoConditions).toHaveBeenCalledWith(ALUMNO, AHORA);
    });

    it('no se puede declarar "ninguna" con condiciones vigentes', async () => {
      const app = crearApp(createRepo().repo);
      const response = await comoAlumno(
        app,
        'post',
        `/students/${ALUMNO}/conditions/none`,
      )
        .send({})
        .expect(409);
      expect(response.body.error).toBe('active_conditions_exist');
    });

    it('una condición cerrada hoy no impide declarar "ninguna"', async () => {
      const { repo } = createRepo({
        listed: [condicion({ endsOn: new Date('2026-10-05T00:00:00Z') })],
      });
      const app = crearApp(repo);

      await comoAlumno(app, 'post', `/students/${ALUMNO}/conditions/none`)
        .send({})
        .expect(200);
      expect(repo.declareNoConditions).toHaveBeenCalledWith(ALUMNO, AHORA);
    });
  });
});
