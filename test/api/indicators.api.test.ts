import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { IndicatorsRepository } from '../../src/modules/indicators/application/indicators.use-cases';
import type {
  FrecuenciaVigente,
  SesionDeAdherencia,
} from '../../src/modules/indicators/domain/adherence';
import type { RegistroDeSerie } from '../../src/modules/indicators/domain/compliance';
import type { SesionDelPeriodo } from '../../src/modules/indicators/domain/signals';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const OTRO_ALUMNO = '20000000-0000-4000-8000-000000000005';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const ADMINISTRADOR = '20000000-0000-4000-8000-000000000009';
const SESION = '50000000-0000-4000-8000-000000000001';
const PRESS = 'ejercicio-press';

const HOY = new Date('2026-10-21T12:00:00Z');
const clock = { now: () => HOY };

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

interface RepoOptions {
  sesiones?: SesionDeAdherencia[];
  frecuencias?: FrecuenciaVigente[];
  registros?: RegistroDeSerie[] | null;
  sesionesConSeries?: SesionDelPeriodo[];
  /** Zona del gimnasio (RN-110). UTC en los tests para que `hace(n)` sea exacto. */
  zona?: string;
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
    findSessionsWithSeriesSince: vi.fn(
      async () => options.sesionesConSeries ?? [],
    ),
    findGymTimeZone: vi.fn(async () => options.zona ?? 'UTC'),
  };
  return repo;
}

/**
 * `createApp` con la asignación entrenador-alumno vigente.
 *
 * Los indicadores exigen el doble filtro completo (HU23, criterio 14): rol y
 * asignación vigente. Los casos que prueban el rechazo pasan su propio doble.
 */
function crearApp(opciones: Parameters<typeof createApp>[0] = {}) {
  return createApp({
    trainerAssignments: {
      isActive: async (trainerId: string, studentId: string) =>
        trainerId === ENTRENADOR && studentId === ALUMNO,
    },
    ...opciones,
  });
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

/** Serie de trabajo completada del press, con su clasificación muscular. */
function serieDelPeriodo(
  overrides: Partial<SesionDelPeriodo['series'][number]> = {},
): SesionDelPeriodo['series'][number] {
  return {
    exerciseId: PRESS,
    warmup: false,
    completed: true,
    performedLoad: 100,
    performedRepetitions: 5,
    musculos: [{ grupo: 'PECTORAL', participacion: 'PRIMARIA' }],
    ...overrides,
  };
}

function sesionDelPeriodo(
  diasAtras: number,
  series: SesionDelPeriodo['series'][number][] = [serieDelPeriodo()],
): SesionDelPeriodo {
  return { occurredOn: hace(diasAtras), completada: true, series };
}

describe('Indicators API - HU23', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /students/:id/indicators/adherence (T1)', () => {
    it('devuelve la adherencia sobre la ventana móvil', async () => {
      const repo = createRepo({
        // RN-110: la ventana son las cuatro semanas completas anteriores a la
        // semana en curso, así que las sesiones van de 3 a 30 días atrás.
        sesiones: [
          { occurredOn: hace(4), completada: true },
          { occurredOn: hace(5), completada: true },
          { occurredOn: hace(9), completada: true },
          { occurredOn: hace(12), completada: true },
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      // La ventana cierra el lunes anterior, así que el cambio de frecuencia
      // de hace 14 días reparte las cuatro semanas 1 con 5 y 3 con 2, no 5 × 4.
      expect(response.body.adherencia.sesionesEsperadas).toBe(11);
    });

    it('el entrenador consulta la adherencia de su alumno', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${ALUMNO}/indicators/adherence`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(200);
    });

    it('RNF-14: un alumno no consulta la de otro', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${OTRO_ALUMNO}/indicators/adherence`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

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
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(404);

      expect(response.body.error).toBe('session_not_found');
    });

    it('RNF-14: un alumno no consulta la sesión de otro', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${OTRO_ALUMNO}/sessions/${SESION}/compliance`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await request(app)
        .get(`/students/${ALUMNO}/sessions/${SESION}/compliance`)
        .expect(401);
    });
  });
});

describe('Indicators API - HU26', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /students/:id/indicators/signals (T1)', () => {
    it('RN-74: detecta estancamiento cuando la carga máxima estimada no crece', async () => {
      // Seis semanas de press con la misma carga: variación 0%, por debajo del
      // umbral de +2,5%.
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(38),
          sesionDelPeriodo(31),
          sesionDelPeriodo(17),
          sesionDelPeriodo(10),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.estancamiento).toHaveLength(1);
      expect(response.body.estancamiento[0].estado).toBe('DETECTADA');
      expect(response.body.estancamiento[0].detalle.exerciseId).toBe(PRESS);
      expect(response.body.estancamiento[0].detalle.variacionPorcentual).toBe(
        0,
      );
      expect(response.body.estancamiento[0].detalle.sesionesConsideradas).toBe(
        4,
      );
    });

    it('RN-74: no hay señal cuando la carga máxima estimada progresa', async () => {
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(38),
          sesionDelPeriodo(31),
          sesionDelPeriodo(17, [serieDelPeriodo({ performedLoad: 110 })]),
          sesionDelPeriodo(10, [serieDelPeriodo({ performedLoad: 110 })]),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.estancamiento[0].estado).toBe('SIN_SENAL');
    });

    it('RN-77: con menos de cuatro sesiones declara datos insuficientes, no «sin estancamiento»', async () => {
      const repo = createRepo({
        sesionesConSeries: [sesionDelPeriodo(20), sesionDelPeriodo(10)],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.estancamiento[0].estado).toBe('DATOS_INSUFICIENTES');
      expect(response.body.estancamiento[0].falta).toContain('4 sesiones');
      expect(response.body.estancamiento[0].detalle).toBeUndefined();
      // RN-77: sin atribución la lista no se puede leer, porque
      // `DATOS_INSUFICIENTES` es idéntico entre un ejercicio y otro.
      expect(response.body.estancamiento[0].sobre).toBe(PRESS);
    });

    it('evalúa el estancamiento por ejercicio, no por alumno', async () => {
      const SENTADILLA = 'ejercicio-sentadilla';
      const ambos = (cargaSentadilla: number) => [
        serieDelPeriodo(),
        serieDelPeriodo({
          exerciseId: SENTADILLA,
          performedLoad: cargaSentadilla,
          musculos: [{ grupo: 'CUADRICEPS', participacion: 'PRIMARIA' }],
        }),
      ];
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(38, ambos(100)),
          sesionDelPeriodo(31, ambos(100)),
          sesionDelPeriodo(17, ambos(120)),
          sesionDelPeriodo(10, ambos(120)),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      const porEjercicio = new Map(
        (
          response.body.estancamiento as { sobre: string; estado: string }[]
        ).map((senal) => [senal.sobre, senal.estado]),
      );
      // El press está trabado; la sentadilla subió un 20%.
      expect(porEjercicio.get(PRESS)).toBe('DETECTADA');
      expect(porEjercicio.get(SENTADILLA)).toBe('SIN_SENAL');
    });

    it('RN-75: detecta la caída de adherencia entre los dos tramos de dos semanas', async () => {
      const repo = createRepo({
        // Cuatro de cuatro en el tramo previo, una de cuatro en el reciente.
        sesiones: [
          { occurredOn: hace(25), completada: true },
          { occurredOn: hace(23), completada: true },
          { occurredOn: hace(19), completada: true },
          { occurredOn: hace(17), completada: true },
          { occurredOn: hace(5), completada: true },
        ],
        frecuencias: [{ desde: hace(60), hasta: null, sesionesPorSemana: 2 }],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.caidaDeAdherencia.estado).toBe('DETECTADA');
      expect(
        response.body.caidaDeAdherencia.detalle.caidaEnPuntos,
      ).toBeGreaterThanOrEqual(25);
    });

    it('RN-75: una variación por debajo del umbral no es señal', async () => {
      const repo = createRepo({
        sesiones: [
          { occurredOn: hace(25), completada: true },
          { occurredOn: hace(19), completada: true },
          { occurredOn: hace(10), completada: true },
          { occurredOn: hace(5), completada: true },
        ],
        frecuencias: [{ desde: hace(60), hasta: null, sesionesPorSemana: 2 }],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.caidaDeAdherencia.estado).toBe('SIN_SENAL');
    });

    it('RN-75: un cero sostenido no es una caída, y la señal lo dice', async () => {
      // Caso real de la base: frecuencia objetivo vigente y ninguna sesión en
      // seis semanas. Los dos tramos dan 0%, así que no hay caída que medir —
      // pero un `SIN_SENAL` a secas se leería como que el alumno va bien.
      const repo = createRepo({
        sesiones: [],
        frecuencias: [{ desde: hace(60), hasta: null, sesionesPorSemana: 3 }],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.caidaDeAdherencia.estado).toBe('SIN_SENAL');
      expect(response.body.caidaDeAdherencia.sobre).toContain(
        'adherencia nula sostenida',
      );
    });

    it('RN-77: sin frecuencia objetivo la caída no se evalúa', async () => {
      const repo = createRepo({ frecuencias: [] });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.caidaDeAdherencia.estado).toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('RN-76: detecta el desbalance por defecto de un grupo muscular', async () => {
      // Una serie de pectoral por semana durante cuatro semanas: 1 serie
      // semanal, muy por debajo del mínimo de 6.
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(24),
          sesionDelPeriodo(17),
          sesionDelPeriodo(10),
          sesionDelPeriodo(3),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.desbalance.estado).toBe('DETECTADA');
      expect(response.body.desbalance.detalle).toEqual([
        { grupo: 'PECTORAL', seriesSemanales: 1, tipo: 'POR_DEFECTO' },
      ]);
    });

    it('RN-76: un volumen dentro del rango no es desbalance', async () => {
      const ochoSeries = Array.from({ length: 8 }, () => serieDelPeriodo());
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(24, ochoSeries),
          sesionDelPeriodo(17, ochoSeries),
          sesionDelPeriodo(10, ochoSeries),
          sesionDelPeriodo(3, ochoSeries),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      // 32 series en cuatro semanas = 8 semanales, entre 6 y 22.
      expect(response.body.desbalance.estado).toBe('SIN_SENAL');
    });

    it('RN-30: un ejercicio sin clasificar no produce desbalance por defecto', async () => {
      const repo = createRepo({
        sesionesConSeries: [
          sesionDelPeriodo(10, [serieDelPeriodo({ musculos: [] })]),
        ],
      });
      const app = crearApp({ indicatorsRepository: repo, clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.desbalance.estado).toBe('DATOS_INSUFICIENTES');
      expect(response.body.desbalance.falta).toContain(
        'clasificación muscular',
      );
    });

    it('DD-04: informa el instante de cálculo porque el indicador no se persiste', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      const response = await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(200);

      expect(response.body.studentId).toBe(ALUMNO);
      expect(response.body.calculadoEl).toBe(HOY.toISOString());
      expect(response.body.estancamiento).toEqual([]);
    });

    it('el entrenador consulta las señales de su alumno', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${ALUMNO}/indicators/signals`,
        ENTRENADOR,
        'ENTRENADOR',
      ).expect(200);
    });

    it('RNF-14: un alumno no consulta las señales de otro', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await como(
        app,
        `/students/${OTRO_ALUMNO}/indicators/signals`,
        ALUMNO,
        'ALUMNO',
      ).expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = crearApp({ indicatorsRepository: createRepo(), clock });

      await request(app)
        .get(`/students/${ALUMNO}/indicators/signals`)
        .expect(401);
    });
  });

  describe('acceso a los indicadores (HU23, criterio 14)', () => {
    const rutas = [
      `/students/${ALUMNO}/indicators/adherence`,
      `/students/${ALUMNO}/sessions/${SESION}/compliance`,
      `/students/${ALUMNO}/indicators/signals`,
    ];

    it.each(rutas)(
      'el administrador recibe 403 en %s',
      async (ruta: string) => {
        // Son datos de seguimiento personal del alumno, no de operación del
        // gimnasio: el administrador no los consulta aunque sea staff.
        const app = crearApp({ indicatorsRepository: createRepo(), clock });

        await como(app, ruta, ADMINISTRADOR, 'ADMINISTRADOR').expect(403);
      },
    );

    it.each(rutas)(
      'un entrenador sin asignación vigente recibe 403 en %s',
      async (ruta: string) => {
        // Haber sido su entrenador alguna vez no alcanza: el segundo paso del
        // doble filtro exige la asignación vigente.
        const app = crearApp({
          indicatorsRepository: createRepo(),
          clock,
          trainerAssignments: { isActive: async () => false },
        });

        await como(app, ruta, ENTRENADOR, 'ENTRENADOR').expect(403);
      },
    );

    it.each(rutas)(
      'el entrenador con asignación vigente accede a %s',
      async (ruta: string) => {
        const app = crearApp({ indicatorsRepository: createRepo(), clock });

        await como(app, ruta, ENTRENADOR, 'ENTRENADOR').expect(200);
      },
    );
  });
});
