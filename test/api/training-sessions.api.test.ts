import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { SetPreloadRepository } from '../../src/modules/training-sessions/application/set-preload.use-cases';
import type {
  EjecucionPrevia,
  SeriePrescripta,
} from '../../src/modules/training-sessions/domain/set-preload';

const ALUMNO = '20000000-0000-4000-8000-000000000004';
const OTRO_ALUMNO = '20000000-0000-4000-8000-000000000005';
const ENTRENADOR = '20000000-0000-4000-8000-000000000002';
const DIA = '40000000-0000-4000-8000-000000000001';
const PRESS = '10000000-0000-4000-8000-000000000001';
const SENTADILLA = '10000000-0000-4000-8000-000000000002';

const HOY = new Date('2026-10-21T12:00:00Z');
const clock = { now: () => HOY };

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

function seriePrescripta(
  overrides: Partial<SeriePrescripta> = {},
): SeriePrescripta {
  return {
    position: 1,
    exerciseId: PRESS,
    repeticionesMinimas: 8,
    repeticionesMaximas: 12,
    cargaSugerida: 60,
    warmup: false,
    ...overrides,
  };
}

interface RepoOptions {
  series?: SeriePrescripta[] | null;
  ultimas?: EjecucionPrevia[];
}

function createRepo(options: RepoOptions = {}) {
  const repo: SetPreloadRepository = {
    findPrescribedSetsOfDay: vi.fn(async () =>
      options.series === undefined ? [seriePrescripta()] : options.series,
    ),
    findLastExecutions: vi.fn(async () => options.ultimas ?? []),
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

function rutaDe(studentId: string, routineDayId = DIA): string {
  return `/students/${studentId}/routine-days/${routineDayId}/set-preload`;
}

describe('Training sessions API - HU22', () => {
  describe('GET /students/:id/routine-days/:id/set-preload (T2)', () => {
    it('RF-030: precarga cada serie con los valores de la última ejecución', async () => {
      const repo = createRepo({
        ultimas: [
          {
            exerciseId: PRESS,
            occurredOn: hace(7),
            carga: 80,
            repeticiones: 10,
          },
        ],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      expect(response.body.series).toHaveLength(1);
      expect(response.body.series[0]).toMatchObject({
        position: 1,
        exerciseId: PRESS,
        carga: 80,
        repeticiones: 10,
        origen: 'ULTIMA_EJECUCION',
      });
    });

    it('DD-15: informa la antigüedad del valor precargado', async () => {
      const repo = createRepo({
        ultimas: [
          {
            exerciseId: PRESS,
            occurredOn: hace(45),
            carga: 80,
            repeticiones: 10,
          },
        ],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      // Un valor de hace mes y medio no se lee igual que el de la semana
      // pasada: la antigüedad viaja junto al valor, no por separado.
      expect(response.body.series[0].antiguedadEnDias).toBe(45);
    });

    it('CB-09: sin historial cae en la carga sugerida de la prescripción', async () => {
      const repo = createRepo({
        series: [seriePrescripta({ cargaSugerida: 60 })],
        ultimas: [],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      expect(response.body.series[0].carga).toBe(60);
      expect(response.body.series[0].origen).toBe('CARGA_SUGERIDA');
      expect(response.body.series[0].antiguedadEnDias).toBeNull();
    });

    it('CB-09: sin historial ni carga sugerida el campo va vacío, nunca cero', async () => {
      const repo = createRepo({
        series: [seriePrescripta({ cargaSugerida: null })],
        ultimas: [],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      // El contrato de CB-09: `null` es «completalo vos», y un cero sería un
      // valor que el alumno confirmaría sin mirar.
      expect(response.body.series[0].carga).toBeNull();
      expect(response.body.series[0].carga).not.toBe(0);
      expect(response.body.series[0].origen).toBe('SIN_DATOS');
      // El rango prescripto sigue estando: es con lo que el alumno trabaja.
      expect(response.body.series[0].repeticionesMinimas).toBe(8);
      expect(response.body.series[0].repeticionesMaximas).toBe(12);
    });

    it('precarga por ejercicio: cada serie mira su propio historial', async () => {
      const repo = createRepo({
        series: [
          seriePrescripta({ position: 1, exerciseId: PRESS }),
          seriePrescripta({
            position: 2,
            exerciseId: SENTADILLA,
            cargaSugerida: 100,
          }),
        ],
        ultimas: [
          {
            exerciseId: PRESS,
            occurredOn: hace(3),
            carga: 85,
            repeticiones: 8,
          },
        ],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      const porEjercicio = new Map(
        (
          response.body.series as {
            exerciseId: string;
            carga: number | null;
            origen: string;
          }[]
        ).map((serie) => [serie.exerciseId, serie]),
      );
      expect(porEjercicio.get(PRESS)).toMatchObject({
        carga: 85,
        origen: 'ULTIMA_EJECUCION',
      });
      expect(porEjercicio.get(SENTADILLA)).toMatchObject({
        carga: 100,
        origen: 'CARGA_SUGERIDA',
      });
    });

    it('RN-66: de varias series del mismo día precarga la de mayor carga', async () => {
      // El repositorio ya resuelve cuál serie del día gana; acá se fija que la
      // precarga use ese valor tal cual, sin volver a elegir.
      const repo = createRepo({
        ultimas: [
          {
            exerciseId: PRESS,
            occurredOn: hace(7),
            carga: 90,
            repeticiones: 8,
          },
        ],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      expect(response.body.series[0].carga).toBe(90);
    });

    it('consulta el historial sólo de los ejercicios del día', async () => {
      const repo = createRepo({
        series: [
          seriePrescripta({ position: 1, exerciseId: PRESS }),
          seriePrescripta({ position: 2, exerciseId: PRESS }),
        ],
      });
      const app = createApp({ setPreloadRepository: repo, clock });

      await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(200);

      // Dos series del mismo ejercicio son una sola consulta de historial.
      expect(repo.findLastExecutions).toHaveBeenCalledWith(ALUMNO, [PRESS]);
    });

    it('un día sin series prescriptas responde una lista vacía', async () => {
      const repo = createRepo({ series: [] });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        200,
      );

      expect(response.body.series).toEqual([]);
      // Sin ejercicios no hay historial que buscar.
      expect(repo.findLastExecutions).not.toHaveBeenCalled();
    });

    it('RN-51: un día que no es de la rutina vigente del alumno responde 404', async () => {
      const repo = createRepo({ series: null });
      const app = createApp({ setPreloadRepository: repo, clock });

      const response = await como(app, rutaDe(ALUMNO), ALUMNO, 'ALUMNO').expect(
        404,
      );

      expect(response.body.error).toBe('routine_day_not_found');
    });

    it('devuelve 400 cuando el día no es un UUID', async () => {
      const app = createApp({ setPreloadRepository: createRepo(), clock });

      await como(app, rutaDe(ALUMNO, 'no-es-uuid'), ALUMNO, 'ALUMNO').expect(
        400,
      );
    });

    it('el entrenador consulta la precarga de su alumno', async () => {
      const app = createApp({ setPreloadRepository: createRepo(), clock });

      await como(app, rutaDe(ALUMNO), ENTRENADOR, 'ENTRENADOR').expect(200);
    });

    it('RNF-14: un alumno no consulta la precarga de otro', async () => {
      const app = createApp({ setPreloadRepository: createRepo(), clock });

      await como(app, rutaDe(OTRO_ALUMNO), ALUMNO, 'ALUMNO').expect(403);
    });

    it('sin sesión responde 401', async () => {
      const app = createApp({ setPreloadRepository: createRepo(), clock });

      await request(app).get(rutaDe(ALUMNO)).expect(401);
    });
  });
});
