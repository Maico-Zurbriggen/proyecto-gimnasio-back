import { describe, expect, it } from 'vitest';

import {
  alcanzoElTopeDeFaltas,
  contarFaltasConsecutivas,
  evaluarDatosDeRenovacion,
  FALTAS_PARA_BLOQUEO,
  hayMedicionEnElCiclo,
  type PropuestaDeRenovacion,
} from './cycle-renewal-data';

describe('cycle-renewal-data domain service', () => {
  const inicioDelCiclo = new Date('2026-07-10T00:00:00Z');

  describe('hayMedicionEnElCiclo (T2)', () => {
    it('detects a measurement taken after the cycle started', () => {
      const mediciones = [{ measuredOn: new Date('2026-08-01T00:00:00Z') }];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(true);
    });

    it('ignores a measurement taken before the cycle started', () => {
      const mediciones = [{ measuredOn: new Date('2026-07-01T00:00:00Z') }];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(false);
    });

    it('ignores a measurement taken on the cycle start date', () => {
      // Pertenece al ciclo anterior, que es el que la motivó.
      const mediciones = [{ measuredOn: new Date('2026-07-10T00:00:00Z') }];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(false);
    });

    it('detects a measurement taken the day after the cycle started', () => {
      const mediciones = [{ measuredOn: new Date('2026-07-11T00:00:00Z') }];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(true);
    });

    it('returns false when the student has no measurements at all', () => {
      expect(hayMedicionEnElCiclo([], inicioDelCiclo)).toBe(false);
    });

    it('detects a valid measurement among older ones', () => {
      const mediciones = [
        { measuredOn: new Date('2026-01-15T00:00:00Z') },
        { measuredOn: new Date('2026-07-01T00:00:00Z') },
        { measuredOn: new Date('2026-08-20T00:00:00Z') },
      ];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(true);
    });

    it('ignores the time of day and compares whole calendar days', () => {
      const mediciones = [{ measuredOn: new Date('2026-07-10T23:59:00Z') }];
      expect(hayMedicionEnElCiclo(mediciones, inicioDelCiclo)).toBe(false);
    });
  });

  describe('contarFaltasConsecutivas (T3)', () => {
    const propuesta = (
      sinDatosActualizados: boolean,
      dia: string,
    ): PropuestaDeRenovacion => ({
      createdAt: new Date(`2026-${dia}T00:00:00Z`),
      sinDatosActualizados,
    });

    it('returns 0 when the student has no previous proposals', () => {
      expect(contarFaltasConsecutivas([])).toBe(0);
    });

    it('returns 0 when the most recent proposal had fresh data', () => {
      const propuestas = [propuesta(false, '07-10'), propuesta(true, '05-10')];
      expect(contarFaltasConsecutivas(propuestas)).toBe(0);
    });

    it('counts a single consecutive miss', () => {
      const propuestas = [propuesta(true, '07-10'), propuesta(false, '05-10')];
      expect(contarFaltasConsecutivas(propuestas)).toBe(1);
    });

    it('counts two consecutive misses', () => {
      const propuestas = [
        propuesta(true, '07-10'),
        propuesta(true, '05-10'),
        propuesta(false, '03-10'),
      ];
      expect(contarFaltasConsecutivas(propuestas)).toBe(2);
    });

    it('stops counting at the first proposal with fresh data', () => {
      // La racha vigente es 2, aunque mas atras haya otras faltas.
      const propuestas = [
        propuesta(true, '09-10'),
        propuesta(true, '07-10'),
        propuesta(false, '05-10'),
        propuesta(true, '03-10'),
        propuesta(true, '01-10'),
      ];
      expect(contarFaltasConsecutivas(propuestas)).toBe(2);
    });
  });

  describe('alcanzoElTopeDeFaltas', () => {
    it('uses 3 consecutive misses as the blocking threshold', () => {
      expect(FALTAS_PARA_BLOQUEO).toBe(3);
    });

    it('does not reach the threshold below 3 misses', () => {
      expect(alcanzoElTopeDeFaltas(0)).toBe(false);
      expect(alcanzoElTopeDeFaltas(1)).toBe(false);
      expect(alcanzoElTopeDeFaltas(2)).toBe(false);
    });

    it('reaches the threshold at 3 or more misses', () => {
      expect(alcanzoElTopeDeFaltas(3)).toBe(true);
      expect(alcanzoElTopeDeFaltas(4)).toBe(true);
    });
  });

  describe('evaluarDatosDeRenovacion - criterios de aceptacion HU03', () => {
    it('Esc. 1: cycle completed with a new measurement -> proposal uses fresh data', () => {
      const resultado = evaluarDatosDeRenovacion(
        [{ measuredOn: new Date('2026-08-01T00:00:00Z') }],
        inicioDelCiclo,
      );

      expect(resultado.sinDatosActualizados).toBe(false);
      expect(resultado.datoFaltante).toBeUndefined();
      expect(resultado.faltasConsecutivas).toBe(0);
      expect(resultado.alcanzoTopeDeFaltas).toBe(false);
    });

    it('Esc. 2: cycle completed without a new measurement -> flagged, with the missing data declared', () => {
      const resultado = evaluarDatosDeRenovacion([], inicioDelCiclo);

      expect(resultado.sinDatosActualizados).toBe(true);
      expect(resultado.datoFaltante).toBe(
        'medicion corporal posterior al inicio del ciclo',
      );
      expect(resultado.faltasConsecutivas).toBe(1);
      expect(resultado.alcanzoTopeDeFaltas).toBe(false);
    });

    it('Esc. 2: a second miss in a row accumulates without reaching the threshold', () => {
      const resultado = evaluarDatosDeRenovacion([], inicioDelCiclo, [
        {
          createdAt: new Date('2026-05-10T00:00:00Z'),
          sinDatosActualizados: true,
        },
      ]);

      expect(resultado.sinDatosActualizados).toBe(true);
      expect(resultado.faltasConsecutivas).toBe(2);
      expect(resultado.alcanzoTopeDeFaltas).toBe(false);
    });

    it('reaches the blocking threshold on the third consecutive miss (feeds T5)', () => {
      const resultado = evaluarDatosDeRenovacion([], inicioDelCiclo, [
        {
          createdAt: new Date('2026-05-10T00:00:00Z'),
          sinDatosActualizados: true,
        },
        {
          createdAt: new Date('2026-03-10T00:00:00Z'),
          sinDatosActualizados: true,
        },
      ]);

      expect(resultado.faltasConsecutivas).toBe(3);
      expect(resultado.alcanzoTopeDeFaltas).toBe(true);
    });

    it('a new measurement resets the streak even after two misses', () => {
      const resultado = evaluarDatosDeRenovacion(
        [{ measuredOn: new Date('2026-08-01T00:00:00Z') }],
        inicioDelCiclo,
        [
          {
            createdAt: new Date('2026-05-10T00:00:00Z'),
            sinDatosActualizados: true,
          },
          {
            createdAt: new Date('2026-03-10T00:00:00Z'),
            sinDatosActualizados: true,
          },
        ],
      );

      expect(resultado.sinDatosActualizados).toBe(false);
      expect(resultado.faltasConsecutivas).toBe(0);
      expect(resultado.alcanzoTopeDeFaltas).toBe(false);
    });

    it('a measurement predating the cycle does not count as fresh data', () => {
      const resultado = evaluarDatosDeRenovacion(
        [{ measuredOn: new Date('2026-06-20T00:00:00Z') }],
        inicioDelCiclo,
      );

      expect(resultado.sinDatosActualizados).toBe(true);
      expect(resultado.faltasConsecutivas).toBe(1);
    });
  });
});
