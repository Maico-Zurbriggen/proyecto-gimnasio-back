import { describe, expect, it } from 'vitest';

import {
  precargarSerie,
  precargarSeries,
  type EjecucionPrevia,
  type SeriePrescripta,
} from './set-preload';

const HOY = new Date('2026-10-21T10:00:00.000Z');
const PRESS = '10000000-0000-4000-8000-000000000001';
const SENTADILLA = '10000000-0000-4000-8000-000000000002';

function serie(overrides: Partial<SeriePrescripta> = {}): SeriePrescripta {
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

function ejecucion(overrides: Partial<EjecucionPrevia> = {}): EjecucionPrevia {
  return {
    exerciseId: PRESS,
    occurredOn: new Date('2026-10-14T00:00:00.000Z'),
    carga: 80,
    repeticiones: 10,
    ...overrides,
  };
}

describe('precargarSerie', () => {
  it('RF-030: precarga con los valores de la última ejecución del alumno', () => {
    const resultado = precargarSerie(serie(), [ejecucion()], HOY);

    expect(resultado.carga).toBe(80);
    expect(resultado.repeticiones).toBe(10);
    expect(resultado.origen).toBe('ULTIMA_EJECUCION');
  });

  it('la última ejecución pesa más que la carga sugerida de la prescripción', () => {
    // La prescripción sugiere 60 kg; el alumno viene levantando 80.
    const resultado = precargarSerie(
      serie({ cargaSugerida: 60 }),
      [ejecucion({ carga: 80 })],
      HOY,
    );

    expect(resultado.carga).toBe(80);
  });

  it('DD-15: informa la antigüedad del valor junto al valor', () => {
    const resultado = precargarSerie(
      serie(),
      [ejecucion({ occurredOn: new Date('2026-09-21T00:00:00.000Z') })],
      HOY,
    );

    expect(resultado.antiguedadEnDias).toBe(30);
  });

  describe('CB-09 · primera ejecución del ejercicio', () => {
    it('cae en la carga sugerida de la prescripción', () => {
      const resultado = precargarSerie(serie({ cargaSugerida: 60 }), [], HOY);

      expect(resultado.carga).toBe(60);
      expect(resultado.origen).toBe('CARGA_SUGERIDA');
      expect(resultado.antiguedadEnDias).toBeNull();
    });

    it('sin carga sugerida deja el campo vacío, y nunca cero', () => {
      const resultado = precargarSerie(serie({ cargaSugerida: null }), [], HOY);

      expect(resultado.carga).toBeNull();
      expect(resultado.carga).not.toBe(0);
      expect(resultado.origen).toBe('SIN_DATOS');
    });

    it('una carga sugerida en cero no se precarga: cero no es un valor propuesto', () => {
      // RN-55 admite registrar 0,00 kg (peso corporal), pero CB-09 prohíbe
      // *proponer* cero por falta de datos. El campo queda vacío.
      const resultado = precargarSerie(serie({ cargaSugerida: 0 }), [], HOY);

      expect(resultado.carga).toBeNull();
      expect(resultado.origen).toBe('SIN_DATOS');
    });

    it('conserva el rango de repeticiones prescripto aunque no haya carga', () => {
      const resultado = precargarSerie(
        serie({
          cargaSugerida: null,
          repeticionesMinimas: 6,
          repeticionesMaximas: 8,
        }),
        [],
        HOY,
      );

      expect(resultado.repeticionesMinimas).toBe(6);
      expect(resultado.repeticionesMaximas).toBe(8);
      expect(resultado.repeticiones).toBeNull();
    });
  });

  it('una ejecución previa sin carga registrada no sirve de precarga', () => {
    // Serie omitida (RN-57): quedó el registro, no el valor.
    const resultado = precargarSerie(
      serie({ cargaSugerida: 60 }),
      [ejecucion({ carga: null })],
      HOY,
    );

    expect(resultado.carga).toBe(60);
    expect(resultado.origen).toBe('CARGA_SUGERIDA');
  });

  it('una carga previa de cero no se repite como precarga', () => {
    const resultado = precargarSerie(
      serie({ cargaSugerida: null }),
      [ejecucion({ carga: 0 })],
      HOY,
    );

    expect(resultado.carga).toBeNull();
    expect(resultado.origen).toBe('SIN_DATOS');
  });

  it('RN-55: una carga previa fuera de rango no se propone', () => {
    const resultado = precargarSerie(
      serie({ cargaSugerida: 60 }),
      [ejecucion({ carga: 1500 })],
      HOY,
    );

    expect(resultado.carga).toBe(60);
    expect(resultado.origen).toBe('CARGA_SUGERIDA');
  });

  it('RN-55: unas repeticiones previas fuera de rango se descartan sin perder la carga', () => {
    const resultado = precargarSerie(
      serie(),
      [ejecucion({ carga: 80, repeticiones: 0 })],
      HOY,
    );

    expect(resultado.carga).toBe(80);
    expect(resultado.repeticiones).toBeNull();
    expect(resultado.origen).toBe('ULTIMA_EJECUCION');
  });

  it('precarga por ejercicio: el historial de uno no contamina al otro', () => {
    const resultado = precargarSerie(
      serie({ exerciseId: SENTADILLA, cargaSugerida: 100 }),
      [ejecucion({ exerciseId: PRESS, carga: 80 })],
      HOY,
    );

    expect(resultado.carga).toBe(100);
    expect(resultado.origen).toBe('CARGA_SUGERIDA');
  });

  it('la antigüedad de una ejecución del mismo día es cero días, no ausente', () => {
    const resultado = precargarSerie(
      serie(),
      [ejecucion({ occurredOn: new Date('2026-10-21T00:00:00.000Z') })],
      HOY,
    );

    expect(resultado.antiguedadEnDias).toBe(0);
  });
});

describe('precargarSeries', () => {
  it('devuelve las series ordenadas por posición', () => {
    const resultado = precargarSeries(
      [
        serie({ position: 3, exerciseId: SENTADILLA }),
        serie({ position: 1 }),
        serie({ position: 2 }),
      ],
      [ejecucion()],
      HOY,
    );

    expect(resultado.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('RN-54: la serie de calentamiento también se precarga, marcada como tal', () => {
    const resultado = precargarSeries(
      [serie({ position: 1, warmup: true })],
      [ejecucion()],
      HOY,
    );

    expect(resultado[0]?.warmup).toBe(true);
    expect(resultado[0]?.carga).toBe(80);
  });

  it('una sesión sin series prescriptas precarga una lista vacía', () => {
    expect(precargarSeries([], [ejecucion()], HOY)).toEqual([]);
  });
});
