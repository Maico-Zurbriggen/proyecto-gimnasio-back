import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type {
  DiagnosticToSave,
  EvolutionDiagnosticsRepository,
} from '../../src/modules/evolution/application/ports/evolution-diagnostics.repository';
import type { SerieDelDiagnostico } from '../../src/modules/evolution/domain/services/evolution-diagnosis';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const VERSION = '62000000-0000-4000-8000-000000000001';
const PRESS = '10000000-0000-4000-8000-000000000001';
const RUTA = '/internal/jobs/evolution-diagnostics';
const SECRETO = 'secreto-de-prueba';

const HOY = new Date('2026-11-09T12:00:00Z');
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

function createRepo(overrides: Partial<EvolutionDiagnosticsRepository> = {}) {
  const guardados: DiagnosticToSave[] = [];

  const repo: EvolutionDiagnosticsRepository = {
    findLatestForStudent: vi.fn(async () => null),
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
    ...overrides,
  };

  return { repo, guardados };
}

function crearApp(repo: EvolutionDiagnosticsRepository) {
  return createApp({ evolutionDiagnosticsRepository: repo, clock });
}

describe('Evolution diagnostics job API - HU32 (T3)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = SECRETO;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.restoreAllMocks();
  });

  it('dispara el diagnóstico de los alumnos con rutina vigente', async () => {
    const { repo, guardados } = createRepo();

    const response = await request(crearApp(repo))
      .get(RUTA)
      .set('Authorization', `Bearer ${SECRETO}`)
      .expect(200);

    expect(response.body).toMatchObject({
      evaluated: 1,
      skipped: 0,
      failed: 0,
    });
    expect(guardados).toHaveLength(1);
  });

  it('el diagnóstico persistido lleva su situación global y sus ejercicios', async () => {
    const { repo, guardados } = createRepo();

    await request(crearApp(repo))
      .get(RUTA)
      .set('Authorization', `Bearer ${SECRETO}`)
      .expect(200);

    expect(guardados[0]?.globalSituation).toBe('ESTANCAMIENTO');
    expect(guardados[0]?.exercises[0]?.exerciseId).toBe(PRESS);
  });

  it('RN-78: reejecutarlo el mismo día no produce un segundo diagnóstico', async () => {
    const { repo, guardados } = createRepo({
      findLastDiagnosticDate: vi.fn(async () => hace(1)),
    });

    const response = await request(crearApp(repo))
      .get(RUTA)
      .set('Authorization', `Bearer ${SECRETO}`)
      .expect(200);

    expect(response.body).toMatchObject({ skipped: 1, evaluated: 0 });
    expect(guardados).toHaveLength(0);
  });

  it('un alumno que falla no detiene la tanda', async () => {
    const { repo } = createRepo({
      listStudentsWithCurrentRoutine: vi.fn(async () => [
        { studentId: ALUMNO, routineVersionId: VERSION },
        { studentId: 'sin-rutina', routineVersionId: VERSION },
      ]),
      loadPeriodData: vi.fn().mockResolvedValueOnce(null).mockResolvedValue({
        routineVersionId: VERSION,
        ejercicios: [],
        adherencia: 80,
        cumplimientoMedio: 85,
      }),
    });

    const response = await request(crearApp(repo))
      .get(RUTA)
      .set('Authorization', `Bearer ${SECRETO}`)
      .expect(200);

    expect(response.body).toMatchObject({ failed: 1, evaluated: 1 });
  });

  it('sin el secreto del cron responde 401', async () => {
    const { repo, guardados } = createRepo();

    await request(crearApp(repo)).get(RUTA).expect(401);
    expect(guardados).toHaveLength(0);
  });

  it('con un secreto incorrecto responde 401', async () => {
    const { repo } = createRepo();

    await request(crearApp(repo))
      .get(RUTA)
      .set('Authorization', 'Bearer otro-secreto')
      .expect(401);
  });
});
