import { describe, expect, it } from 'vitest';

import { evaluarDatosDeRenovacion } from '../../domain/services/cycle-renewal-data';
import { construirAdvertenciaDatos } from './proposal-review.dto';

describe('proposal-review.dto - criterios de aceptacion HU04 (T1)', () => {
  const inicioDelCiclo = new Date('2026-07-10T00:00:00Z');

  it('Esc. 1: proposal generated with fresh data carries no warning', () => {
    const advertencia = construirAdvertenciaDatos(
      evaluarDatosDeRenovacion(
        [{ measuredOn: new Date('2026-08-01T00:00:00Z') }],
        inicioDelCiclo,
      ),
    );

    expect(advertencia.sinDatosActualizados).toBe(false);
    expect(advertencia.datoFaltante).toBeUndefined();
    expect(advertencia.faltasConsecutivas).toBe(0);
  });

  it('Esc. 2: proposal generated without fresh data is flagged, with the missing data named', () => {
    const advertencia = construirAdvertenciaDatos(
      evaluarDatosDeRenovacion([], inicioDelCiclo),
    );

    expect(advertencia.sinDatosActualizados).toBe(true);
    expect(advertencia.datoFaltante).toBe(
      'medicion corporal posterior al inicio del ciclo',
    );
    expect(advertencia.faltasConsecutivas).toBe(1);
    expect(advertencia.alcanzoTopeDeFaltas).toBe(false);
  });

  it('carries the consecutive-miss streak so the trainer sees how long it has been', () => {
    const advertencia = construirAdvertenciaDatos(
      evaluarDatosDeRenovacion([], inicioDelCiclo, [
        {
          createdAt: new Date('2026-05-10T00:00:00Z'),
          sinDatosActualizados: true,
        },
        {
          createdAt: new Date('2026-03-10T00:00:00Z'),
          sinDatosActualizados: true,
        },
      ]),
    );

    expect(advertencia.faltasConsecutivas).toBe(3);
    expect(advertencia.alcanzoTopeDeFaltas).toBe(true);
  });
});
