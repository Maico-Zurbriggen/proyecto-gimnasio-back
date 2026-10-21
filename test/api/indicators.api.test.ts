import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { IndicatorsRepository } from '../../src/modules/indicators/application/indicators.use-cases';
import type {
  FrecuenciaVigente,
  SesionDeAdherencia,
} from '../../src/modules/indicators/domain/adherence';
import type { RegistroDeSerie } from '../../src/modules/indicators/domain/compliance';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const OTRO_ALUMNO = '20000000-0000-4000-8000-000000000005';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const SESION = '50000000-0000-4000-8000-000000000001';

const HOY = new Date('2026-10-21T12:00:00Z');
const clock = { now: () => HOY };

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

interface RepoOptions {
  sesiones?: SesionDeAdherencia[];
  frecuencias?: FrecuenciaVigente[];
  registros?: RegistroDeSerie[] | null;
}

function createRepo(options: RepoOptions = {}) {
  const repo: IndicatorsRepository = {
    findSessionsSince: vi.fn(async () => options.sesiones ?? []),
    findTargetFrequencies: vi.fn(
      async () =>
        options.frecuencias ?? [
          { desde: hace(60), hasta: null, sesionesPorSemana: 4 },
        ],
    ),
    findSessionSetRecords: vi.fn(async () =>
      options.registros === undefined ? [] : options.registros,
    ),
  };
  return repo;
}

function como(
  app: ReturnType<typeof createApp>,
  ruta: string,
  userId: string,
  roles: string,
) {
  return request(app)
    .get(ruta)
    .set('x-user-id', userId)
    .set('x-user-roles', roles);
}

describe('Indicators API - HU23', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /students/:id/indicators/adherence (T1)', () => {
    it('devuelve la adherencia sobre la ventana móvil', async () => {
      const repo = createRepo({
        sesiones: [
          { occurredOn: hace(2), completada: true },
          { occurredOn: hace(5), completada: true },
          { occurredOn: hace(9), completada: true },
          { occurredOn: hace(12), completada: true },
        ],
      });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.adherencia.disponible).toBe(true);
      expect(response.body.adherencia.sesionesEsperadas).toBe(16);
      expect(response.body.adherencia.sesionesCompletadas).toBe(4);
      expect(response.body.adherencia.porcentaje).toBe(25);
    });

    it('RN-68: declara que no hay historial suficiente, sin devolver cero', async () => {
      const repo = createRepo({
        frecuencias: [{ desde: hace(5), hasta: null, sesionesPorSemana: 4 }],
      });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.adherencia.disponible).toBe(false);
      expect(response.body.adherencia.motivo).toBe('SIN_HISTORIAL_SUFICIENTE');
      expect(response.body.adherencia.porcentaje).toBeUndefined();
    });

    it('RN-67: usa la frecuencia vigente en cada semana', async () => {
      const repo = createRepo({
        frecuencias: [
          { desde: hace(60), hasta: hace(14), sesionesPorSemana: 2 },
          { desde: hace(14), hasta: null, sesionesPorSemana: 5 },
        ],
      });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      // Dos semanas con 5 y dos con 2, no 5 × 4.
      expect(response.body.adherencia.sesionesEsperadas).toBe(14);
    });

    it('el entrenador consulta la adherencia de su alumno', async () => {
      const app = createApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(200);
    });

    it('RNF-14: un alumno no consulta la de otro', async () => {
      const app = createApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${OTRO_ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = createApp({ indicatorsRepository: createRepo(), clock });

      await request(app)
        .get(`/students/${ALUMNO}/indicators/adherence`)
        .expect(401);
    });
  });

  describe('GET /students/:id/sessions/:sessionId/compliance (T2)', () => {
    const serie = (
      overrides: Partial<RegistroDeSerie> = {},
    ): RegistroDeSerie => ({
      warmup: false,
      additional: false,
      completed: true,
      prescribedMaxRepetitions: 10,
      performedRepetitions: 10,
      ...overrides,
    });

    it('devuelve los dos cumplimientos por separado', async () => {
      const repo = createRepo({
        registros: [
          serie(),
          serie({ performedRepetitions: 5 }),
          serie({ completed: false, performedRepetitions: null }),
        ],
      });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      // Series: 2 de 3 completadas. Repeticiones: 15 de 30.
      expect(response.body.cumplimientoDeSeries.porcentaje).toBeCloseTo(
        66.67,
        1,
      );
      expect(response.body.cumplimientoDeRepeticiones.porcentaje).toBe(50);
    });

    it('RN-54: el calentamiento no entra en ningún cumplimiento', async () => {
      const repo = createRepo({
        registros: [
          serie({ warmup: true, completed: false, performedRepetitions: null }),
          serie(),
        ],
      });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.cumplimientoDeSeries.denominador).toBe(1);
      expect(response.body.cumplimientoDeSeries.porcentaje).toBe(100);
    });

    it('RN-73: declara la ausencia cuando no hay series de trabajo', async () => {
      const repo = createRepo({ registros: [] });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.cumplimientoDeSeries.disponible).toBe(false);
      expect(response.body.cumplimientoDeSeries.motivo).toBe(
        'SIN_SERIES_DE_TRABAJO',
      );
    });

    it('RNF-14: una sesión ajena responde 404 genérico', async () => {
      const repo = createRepo({ registros: null });
      const app = createApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(404);

      expect(response.body.error).toBe('session_not_found');
    });

    it('RNF-14: un alumno no consulta la sesión de otro', async () => {
      const app = createApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${OTRO_ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = createApp({ indicatorsRepository: createRepo(), clock });

      await request(app)
        .get(`/students/${ALUMNO}/sessions/${SESION}/compliance`)
        .expect(401);
    });
  });
});
