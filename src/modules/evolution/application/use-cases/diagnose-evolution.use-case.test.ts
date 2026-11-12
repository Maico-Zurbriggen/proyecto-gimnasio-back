import { describe, expect, it, vi } from 'vitest';

import type {
  DiagnosticToSave,
  EvolutionDiagnosticsRepository,
  StudentPeriodData,
} from '../ports/evolution-diagnostics.repository';
import type { SerieDelDiagnostico } from '../../domain/services/evolution-diagnosis';
import {
  DiagnoseEvolutionUseCase,
  DiagnoseWeeklyEvolutionUseCase,
  StudentNotDiagnosableError,
} from './diagnose-evolution.use-case';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const VERSION = '62000000-0000-4000-8000-000000000001';
const PRESS = '10000000-0000-4000-8000-000000000001';
const SENTADILLA = '10000000-0000-4000-8000-000000000002';

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

/** Cuatro sesiones repartidas en las dos mitades del período. */
function cuatroSesiones(overrides: Partial<SerieDelDiagnostico> = {}) {
  return [38, 30, 14, 7].map((dias) => ({
    occurredOn: hace(dias),
    series: [serie(overrides)],
  }));
}

interface RepoOptions {
  datos?: StudentPeriodData | null;
  ultimoDiagnostico?: Date | null;
  alumnos?: { studentId: string; routineVersionId: string }[];
}

function createRepo(options: RepoOptions = {}) {
  const guardados: DiagnosticToSave[] = [];

  const repo: EvolutionDiagnosticsRepository = {
    listStudentsWithCurrentRoutine: vi.fn(
      async () =>
        options.alumnos ?? [{ studentId: ALUMNO, routineVersionId: VERSION }],
    ),
    loadPeriodData: vi.fn(async () =>
      options.datos === undefined
        ? {
            routineVersionId: VERSION,
            ejercicios: [{ exerciseId: PRESS, sesiones: cuatroSesiones() }],
            adherencia: 80,
            cumplimientoMedio: 85,
          }
        : options.datos,
    ),
    findLastDiagnosticDate: vi.fn(
      async () => options.ultimoDiagnostico ?? null,
    ),
    save: vi.fn(async (diagnostic: DiagnosticToSave) => {
      guardados.push(diagnostic);
      return `diag-${String(guardados.length)}`;
    }),
  };

  return { repo, guardados };
}

describe('DiagnoseEvolutionUseCase (HU32 - T1, T2)', () => {
  it('persiste el diagnóstico global y el de cada ejercicio', async () => {
    const { repo, guardados } = createRepo();
    const resultado = await new DiagnoseEvolutionUseCase(repo, clock).execute(
      ALUMNO,
    );

    expect(resultado.diagnosticId).toBe('diag-1');
    expect(guardados[0]?.studentId).toBe(ALUMNO);
    expect(guardados[0]?.routineVersionId).toBe(VERSION);
    expect(guardados[0]?.exercises).toHaveLength(1);
  });

  it('el período abarca seis semanas hasta hoy (D2/§3)', async () => {
    const { repo, guardados } = createRepo();
    await new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO);

    expect(guardados[0]?.periodEnd.toISOString().slice(0, 10)).toBe(
      '2026-11-09',
    );
    expect(guardados[0]?.periodStart.toISOString().slice(0, 10)).toBe(
      '2026-09-28',
    );
  });

  it('cada ejercicio lleva sus métricas, que sustentan la situación (RN-84)', async () => {
    const { repo, guardados } = createRepo();
    await new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO);

    const metricas = guardados[0]?.exercises[0]?.metrics as {
      sesionesConsideradas: number;
    };
    expect(metricas.sesionesConsideradas).toBe(4);
  });

  it('evalúa cada ejercicio por separado', async () => {
    const { repo, guardados } = createRepo({
      datos: {
        routineVersionId: VERSION,
        ejercicios: [
          // Press con la carga quieta; sentadilla subiendo.
          { exerciseId: PRESS, sesiones: cuatroSesiones() },
          {
            exerciseId: SENTADILLA,
            sesiones: [
              { occurredOn: hace(38), series: [serie({ performedLoad: 100 })] },
              { occurredOn: hace(30), series: [serie({ performedLoad: 100 })] },
              { occurredOn: hace(14), series: [serie({ performedLoad: 120 })] },
              { occurredOn: hace(7), series: [serie({ performedLoad: 120 })] },
            ],
          },
        ],
        adherencia: 80,
        cumplimientoMedio: 85,
      },
    });
    await new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO);

    const porEjercicio = new Map(
      (guardados[0]?.exercises ?? []).map((item) => [
        item.exerciseId,
        item.situation,
      ]),
    );
    expect(porEjercicio.get(PRESS)).toBe('ESTANCAMIENTO');
    expect(porEjercicio.get(SENTADILLA)).toBe('PROGRESION_ADECUADA');
  });

  it('RN-82: un diagnóstico sin datos igual se registra', async () => {
    // Un diagnóstico sin propuesta es un resultado, no un fallo: es lo que
    // permite que la vista diga «no disponible» con fundamento.
    const { repo, guardados } = createRepo({
      datos: {
        routineVersionId: VERSION,
        ejercicios: [{ exerciseId: PRESS, sesiones: [] }],
        adherencia: null,
        cumplimientoMedio: null,
      },
    });
    const resultado = await new DiagnoseEvolutionUseCase(repo, clock).execute(
      ALUMNO,
    );

    expect(resultado.globalSituation).toBe('DATOS_INSUFICIENTES');
    expect(guardados).toHaveLength(1);
  });

  it('RN-81: declara los criterios que no pudo evaluar', async () => {
    const { repo, guardados } = createRepo({
      datos: {
        routineVersionId: VERSION,
        ejercicios: [
          {
            exerciseId: PRESS,
            sesiones: cuatroSesiones({ perceivedEffort: null }),
          },
        ],
        adherencia: null,
        cumplimientoMedio: 85,
      },
    });
    await new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO);

    expect(guardados[0]?.criteriaNotEvaluated).toContain(
      'esfuerzo_percibido_no_registrado',
    );
    expect(guardados[0]?.criteriaNotEvaluated).toContain(
      'adherencia_no_disponible',
    );
  });

  it('registra la versión del componente que lo produjo', async () => {
    const { repo, guardados } = createRepo();
    await new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO);

    expect(guardados[0]?.componentVersion).toBe('evolution-diagnosis@1');
  });

  it('un alumno sin rutina vigente no se diagnostica', async () => {
    const { repo } = createRepo({ datos: null });

    await expect(
      new DiagnoseEvolutionUseCase(repo, clock).execute(ALUMNO),
    ).rejects.toThrow(StudentNotDiagnosableError);
  });
});

describe('DiagnoseWeeklyEvolutionUseCase (HU32 - T3)', () => {
  function weekly(repo: EvolutionDiagnosticsRepository) {
    return new DiagnoseWeeklyEvolutionUseCase(
      repo,
      new DiagnoseEvolutionUseCase(repo, clock),
      clock,
    );
  }

  it('diagnostica a los alumnos con rutina vigente', async () => {
    const { repo, guardados } = createRepo();
    const resultado = await weekly(repo).execute();

    expect(resultado.evaluated).toBe(1);
    expect(resultado.diagnosticIds).toEqual(['diag-1']);
    expect(guardados).toHaveLength(1);
  });

  it('RN-78: no repite el diagnóstico antes de las dos semanas', async () => {
    // Reejecutar el job no debe producir un segundo diagnóstico del mismo
    // período: correrlo de más tiene que ser inofensivo.
    const { repo, guardados } = createRepo({
      ultimoDiagnostico: hace(3),
    });
    const resultado = await weekly(repo).execute();

    expect(resultado.skipped).toBe(1);
    expect(resultado.evaluated).toBe(0);
    expect(guardados).toHaveLength(0);
  });

  it('pasadas las dos semanas vuelve a diagnosticar', async () => {
    const { repo } = createRepo({ ultimoDiagnostico: hace(15) });

    expect((await weekly(repo).execute()).evaluated).toBe(1);
  });

  it('un alumno que falla no detiene a los demás', async () => {
    const { repo } = createRepo({
      alumnos: [
        { studentId: ALUMNO, routineVersionId: VERSION },
        { studentId: 'otro', routineVersionId: VERSION },
      ],
    });
    // El segundo alumno ya no tiene rutina vigente cuando le toca.
    let llamadas = 0;
    repo.loadPeriodData = vi.fn(async () => {
      llamadas += 1;
      if (llamadas === 1) return null;
      return {
        routineVersionId: VERSION,
        ejercicios: [{ exerciseId: PRESS, sesiones: cuatroSesiones() }],
        adherencia: 80,
        cumplimientoMedio: 85,
      };
    });

    const resultado = await weekly(repo).execute();

    expect(resultado.failed).toBe(1);
    expect(resultado.evaluated).toBe(1);
  });

  it('sin alumnos con rutina vigente no hace nada', async () => {
    const { repo, guardados } = createRepo({ alumnos: [] });
    const resultado = await weekly(repo).execute();

    expect(resultado).toMatchObject({ evaluated: 0, skipped: 0, failed: 0 });
    expect(guardados).toHaveLength(0);
  });
});
