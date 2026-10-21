import { describe, expect, it } from 'vitest';

import {
  cumplimientoDeRepeticiones,
  cumplimientoDeSeries,
  type RegistroDeSerie,
} from './compliance';

/** Serie de trabajo prescripta, con lo ejecutado. */
function serie(overrides: Partial<RegistroDeSerie> = {}): RegistroDeSerie {
  return {
    warmup: false,
    additional: false,
    completed: true,
    prescribedMaxRepetitions: 10,
    performedRepetitions: 10,
    ...overrides,
  };
}

describe('compliance (HU23 - T2)', () => {
  describe('cumplimientoDeSeries (RN-69)', () => {
    it('calcula completadas sobre prescriptas', () => {
      const registros = [
        serie(),
        serie(),
        serie({ completed: false }),
        serie({ completed: false }),
      ];
      const resultado = cumplimientoDeSeries(registros);

      expect(resultado.disponible).toBe(true);
      if (resultado.disponible) {
        expect(resultado.numerador).toBe(2);
        expect(resultado.denominador).toBe(4);
        expect(resultado.porcentaje).toBe(50);
      }
    });

    it('da 100% cuando se completaron todas', () => {
      const resultado = cumplimientoDeSeries([serie(), serie(), serie()]);

      if (resultado.disponible) {
        expect(resultado.porcentaje).toBe(100);
      }
    });

    it('RN-54: el calentamiento no cuenta', () => {
      const registros = [
        serie({ warmup: true, completed: false }),
        serie({ warmup: true, completed: false }),
        serie(),
      ];
      const resultado = cumplimientoDeSeries(registros);

      if (resultado.disponible) {
        expect(resultado.denominador).toBe(1);
        expect(resultado.porcentaje).toBe(100);
      }
    });

    it('las series agregadas no cuentan para cumplimiento', () => {
      // Cuentan para volumen, pero no estaban prescriptas: sumarlas permitiría
      // superar el 100% sin haber hecho lo pedido.
      const registros = [
        serie({ completed: false }),
        serie({ additional: true }),
        serie({ additional: true }),
      ];
      const resultado = cumplimientoDeSeries(registros);

      if (resultado.disponible) {
        expect(resultado.denominador).toBe(1);
        expect(resultado.porcentaje).toBe(0);
      }
    });

    it('RN-73: declara la ausencia si no hay series de trabajo', () => {
      const resultado = cumplimientoDeSeries([serie({ warmup: true })]);

      expect(resultado.disponible).toBe(false);
      if (!resultado.disponible) {
        expect(resultado.motivo).toBe('SIN_SERIES_DE_TRABAJO');
      }
    });

    it('declara la ausencia con una sesión sin registros', () => {
      expect(cumplimientoDeSeries([]).disponible).toBe(false);
    });
  });

  describe('cumplimientoDeRepeticiones (RN-69a)', () => {
    it('usa el tope del rango como objetivo', () => {
      // Rango 8-12: cumplir el 100% es haber hecho 12, no 8.
      const registros = [
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 12 }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.denominador).toBe(12);
        expect(resultado.porcentaje).toBe(100);
      }
    });

    it('quedarse en el piso del rango no es el 100%', () => {
      const registros = [
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 8 }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.porcentaje).toBeCloseTo(66.67, 1);
      }
    });

    it('suma sobre todas las series de trabajo', () => {
      const registros = [
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 10 }),
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 8 }),
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 6 }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.numerador).toBe(24);
        expect(resultado.denominador).toBe(30);
        expect(resultado.porcentaje).toBe(80);
      }
    });

    it('una serie omitida aporta cero, no se descarta', () => {
      // Descartarla del denominador escondería el incumplimiento.
      const registros = [
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 10 }),
        serie({
          prescribedMaxRepetitions: 10,
          performedRepetitions: null,
          completed: false,
        }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.denominador).toBe(20);
        expect(resultado.porcentaje).toBe(50);
      }
    });

    it('se acota al 100% cuando se hace de más', () => {
      const registros = [
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 15 }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.porcentaje).toBe(100);
      }
    });

    it('RN-54: el calentamiento no cuenta', () => {
      const registros = [
        serie({
          warmup: true,
          prescribedMaxRepetitions: 20,
          performedRepetitions: 20,
        }),
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 5 }),
      ];
      const resultado = cumplimientoDeRepeticiones(registros);

      if (resultado.disponible) {
        expect(resultado.denominador).toBe(10);
        expect(resultado.porcentaje).toBe(50);
      }
    });

    it('RN-73: declara la ausencia si no hay series de trabajo', () => {
      const resultado = cumplimientoDeRepeticiones([]);

      expect(resultado.disponible).toBe(false);
      if (!resultado.disponible) {
        expect(resultado.motivo).toBe('SIN_SERIES_DE_TRABAJO');
      }
    });
  });

  describe('los dos indicadores son distintos y no se mezclan', () => {
    it('completar todas las series no implica el 100% de repeticiones', () => {
      // D2/§2 prohíbe hablar de «cumplimiento» sin calificar cuál, justamente
      // porque pueden divergir: vino, hizo todas las series, pero con menos
      // repeticiones de las pedidas.
      const registros = [
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 6 }),
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 6 }),
      ];

      const series = cumplimientoDeSeries(registros);
      const repeticiones = cumplimientoDeRepeticiones(registros);

      if (series.disponible && repeticiones.disponible) {
        expect(series.porcentaje).toBe(100);
        expect(repeticiones.porcentaje).toBe(50);
      }
    });
  });
});
