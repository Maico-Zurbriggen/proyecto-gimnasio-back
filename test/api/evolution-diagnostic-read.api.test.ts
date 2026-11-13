import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  DiagnosticToSave,
  EvolutionDiagnosticsRepository,
  StoredDiagnostic,
} from '../../src/modules/evolution/application/ports/evolution-diagnostics.repository';
import type { SerieDelDiagnostico } from '../../src/modules/evolution/domain/services/evolution-diagnosis';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const OTRO_ALUMNO = '20000000-0000-4000-8000-000000000005';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000009';
const VERSION = '62000000-0000-4000-8000-000000000001';
const PRESS = '10000000-0000-4000-8000-000000000001';

const HOY = new Date('2026-11-13T12:00:00Z');
const clock = { now: () => HOY };

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

function serie(
  overrides: Partial<SerieDelDiagnostico> = {},
): SerieDelDiagnostico {
  return {
    warmup: false,
    additional: false,
    completed: true,
    performedLoad: 100,
    performedRepetitions: 10,
    prescribedMaxRepetitions: 12,
    perceivedEffort: 7,
    ...overrides,
  };
}

function diagnosticoGuardado(
  overrides: Partial<StoredDiagnostic> = {},
): StoredDiagnostic {
  return {
    id: 'diag-1',
    studentId: ALUMNO,
    routineVersionId: VERSION,
    periodStart: new Date('2026-10-02T00:00:00Z'),
    periodEnd: new Date('2026-11-13T00:00:00Z'),
    globalSituation: 'ESTANCAMIENTO',
    adherence: 75,
    componentVersion: 'evolution-diagnosis@1',
    criteriaNotEvaluated: [],
    calculatedAt: new Date('2026-11-13T03:30:00Z'),
    exercises: [
      {
        exerciseId: PRESS,
        exerciseName: 'Press de banca',
        situation: 'ESTANCAMIENTO',
        metrics: { sesionesConsideradas: 4 },
      },
    ],
    ...overrides,
  };
}

interface RepoOptions {
  ultimo?: StoredDiagnostic | null;
}

function createRepo(options: RepoOptions = {}) {
  const guardados: DiagnosticToSave[] = [];

  const repo: EvolutionDiagnosticsRepository = {
    findLatestForStudent: vi.fn(async () =>
      options.ultimo === undefined ? diagnosticoGuardado() : options.ultimo,
    ),
    listStudentsWithCurrentRoutine: vi.fn(async () => [
      { studentId: ALUMNO, routineVersionId: VERSION },
    ]),
    loadPeriodData: vi.fn(async () => ({
      routineVersionId: VERSION,
      ejercicios: [
        {
          exerciseId: PRESS,
          sesiones: [38, 30, 14, 7].map((dias) => ({
            occurredOn: hace(dias),
            series: [serie()],
          })),
        },
      ],
      adherencia: 80,
      cumplimientoMedio: 85,
    })),
    findLastDiagnosticDate: vi.fn(async () => null),
    save: vi.fn(async (diagnostic: DiagnosticToSave) => {
      guardados.push(diagnostic);
      return `diag-${String(guardados.length)}`;
    }),
  };

  return { repo, guardados };
}

function crearApp(repo: EvolutionDiagnosticsRepository) {
  return createApp({
    evolutionDiagnosticsRepository: repo,
    clock,
    trainerAssignments: {
      isActive: (trainerId: string, studentId: string) =>
        Promise.resolve(trainerId === ENTRENADOR && studentId === ALUMNO),
    },
  });
}

function como(
  app: ReturnType<typeof createApp>,
  metodo: 'get' | 'post',
  ruta: string,
  userId: string,
  roles: string,
) {
  const req =
    metodo === 'get' ? request(app).get(ruta) : request(app).post(ruta);
  return req.set('x-user-id', userId).set('x-user-roles', roles);
}

const RUTA = `/students/${ALUMNO}/evolution-diagnostic`;

describe('Evolution diagnostic read API - HU32', () => {
  describe('GET · consulta del diagnóstico vigente', () => {
    it('el alumno lee su diagnóstico', async () => {
      const { repo } = createRepo();

      const response = await como(
        crearApp(repo),
        'get',
        RUTA,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body).toMatchObject({
        disponible: true,
        studentId: ALUMNO,
        globalSituation: 'ESTANCAMIENTO',
        adherencia: 75,
      });
    });

    it('incluye la situación y las métricas de cada ejercicio (RN-84)', async () => {
      const { repo } = createRepo();

      const response = await como(
        crearApp(repo),
        'get',
        RUTA,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.ejercicios[0]).toMatchObject({
        exerciseId: PRESS,
        exerciseName: 'Press de banca',
        situation: 'ESTANCAMIENTO',
      });
    });

    it('RN-98: informa el período, la versión del componente y cuándo se calculó', async () => {
      const { repo } = createRepo();

      const response = await como(
        crearApp(repo),
        'get',
        RUTA,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body).toMatchObject({
        periodStart: '2026-10-02',
        periodEnd: '2026-11-13',
        componentVersion: 'evolution-diagnosis@1',
        calculadoEl: '2026-11-13T03:30:00.000Z',
      });
    });

    it('RNF-12: sin diagnóstico calculado responde «no disponible», no 404', async () => {
      // Que el proceso no haya corrido es un estado legítimo: la vista tiene
      // que poder declararlo sin degradarse. Un 404 diría que el alumno no
      // existe, que es otra cosa.
      const { repo } = createRepo({ ultimo: null });

      const response = await como(
        crearApp(repo),
        'get',
        RUTA,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body).toEqual({
        studentId: ALUMNO,
        disponible: false,
        motivo: 'SIN_DIAGNOSTICO_CALCULADO',
      });
    });

    it('RN-81: declara los criterios que no se pudieron evaluar', async () => {
      const { repo } = createRepo({
        ultimo: diagnosticoGuardado({
          criteriaNotEvaluated: ['esfuerzo_percibido_no_registrado'],
        }),
      });

      const response = await como(
        crearApp(repo),
        'get',
        RUTA,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.criteriosNoEvaluados).toContain(
        'esfuerzo_percibido_no_registrado',
      );
    });

    it('el entrenador con asignación vigente lee el de su alumno', async () => {
      const { repo } = createRepo();

      await como(crearApp(repo), 'get', RUTA, ENTRENADOR, 'ENTRENADOR').expect(
        200,
      );
    });

    it('el administrador recibe 403 (D3)', async () => {
      // El diagnóstico es un dato de seguimiento personal, no de operación
      // del gimnasio.
      const { repo } = createRepo();

      await como(
        crearApp(repo),
        'get',
        RUTA,
        ADMINISTRADOR,
        'ADMINISTRADOR',
      ).expect(403);
    });

    it('un alumno no lee el diagnóstico de otro', async () => {
      const { repo } = createRepo();

      await como(
        crearApp(repo),
        'get',
        `/students/${OTRO_ALUMNO}/evolution-diagnostic`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('un entrenador sin asignación vigente recibe 403', async () => {
      const { repo } = createRepo();

      await como(
        crearApp(repo),
        'get',
        `/students/${OTRO_ALUMNO}/evolution-diagnostic`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const { repo } = createRepo();

      await request(crearApp(repo)).get(RUTA).expect(401);
    });
  });

  describe('POST · recálculo a pedido del entrenador (RN-78, FL-09/A2)', () => {
    it('el entrenador lo pide antes de tiempo y se calcula igual', async () => {
      // A diferencia del job semanal, acá no se aplica la periodicidad de dos
      // semanas: el pedido explícito es la excepción que la regla contempla.
      const { repo, guardados } = createRepo();

      const response = await como(
        crearApp(repo),
        'post',
        RUTA,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(201);

      expect(response.body.globalSituation).toBeDefined();
      expect(guardados).toHaveLength(1);
    });

    it('no consulta la periodicidad: el pedido manda', async () => {
      const { repo, guardados } = createRepo();
      repo.findLastDiagnosticDate = vi.fn(async () => hace(1));

      await como(crearApp(repo), 'post', RUTA, ENTRENADOR, 'ENTRENADOR').expect(
        201,
      );

      expect(guardados).toHaveLength(1);
    });

    it('el alumno también puede pedir el suyo', async () => {
      const { repo } = createRepo();

      await como(crearApp(repo), 'post', RUTA, ALUMNO, 'ALUMNO').expect(201);
    });

    it('un alumno sin rutina vigente responde 409', async () => {
      const { repo } = createRepo();
      repo.loadPeriodData = vi.fn(async () => null);

      const response = await como(
        crearApp(repo),
        'post',
        RUTA,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(409);

      expect(response.body.error).toBe('student_without_current_routine');
    });

    it('el administrador no lo dispara', async () => {
      const { repo, guardados } = createRepo();

      await como(
        crearApp(repo),
        'post',
        RUTA,
        ADMINISTRADOR,
        'ADMINISTRADOR',
      ).expect(403);
      expect(guardados).toHaveLength(0);
    });

    it('un entrenador sin asignación vigente no lo dispara', async () => {
      const { repo, guardados } = createRepo();

      await como(
        crearApp(repo),
        'post',
        `/students/${OTRO_ALUMNO}/evolution-diagnostic`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(403);
      expect(guardados).toHaveLength(0);
    });
  });
});
