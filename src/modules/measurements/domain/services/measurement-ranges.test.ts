import { describe, expect, it } from 'vitest';

import {
  ALTURA_MAX_CM,
  ALTURA_MIN_CM,
  PESO_MAX_KG,
  PESO_MIN_KG,
  validarAltura,
  validarMedidas,
  validarPeso,
} from './measurement-ranges';

describe('measurement-ranges domain service (HU02 - T2)', () => {
  describe('rangos declarados', () => {
    it('admits weight between 20 and 250 kg', () => {
      expect(PESO_MIN_KG).toBe(20);
      expect(PESO_MAX_KG).toBe(250);
    });

    it('admits height between 100 and 250 cm', () => {
      expect(ALTURA_MIN_CM).toBe(100);
      expect(ALTURA_MAX_CM).toBe(250);
    });
  });

  describe('validarPeso', () => {
    it('accepts a value inside the range', () => {
      expect(validarPeso(75.5)).toBeNull();
    });

    it('Esc. 1.3: accepts the exact lower bound', () => {
      expect(validarPeso(20)).toBeNull();
    });

    it('Esc. 1.3: accepts the exact upper bound', () => {
      expect(validarPeso(250)).toBeNull();
    });

    it('Esc. 1.1: rejects a value below the range', () => {
      const violacion = validarPeso(19.9);
      expect(violacion).not.toBeNull();
      expect(violacion?.campo).toBe('weightKg');
      expect(violacion?.valor).toBe(19.9);
    });

    it('Esc. 1.1: rejects a value above the range', () => {
      expect(validarPeso(250.1)).not.toBeNull();
    });

    it('Esc. 1.1: the error message names the admitted range', () => {
      const violacion = validarPeso(500);
      expect(violacion?.mensaje).toContain('20');
      expect(violacion?.mensaje).toContain('250');
      expect(violacion?.mensaje).toContain('kg');
    });

    it('rejects absurd values', () => {
      expect(validarPeso(0)).not.toBeNull();
      expect(validarPeso(-70)).not.toBeNull();
      expect(validarPeso(999)).not.toBeNull();
    });

    it('rejects values that are not finite numbers', () => {
      expect(validarPeso(Number.NaN)).not.toBeNull();
      expect(validarPeso(Number.POSITIVE_INFINITY)).not.toBeNull();
    });
  });

  describe('validarAltura', () => {
    it('accepts a value inside the range', () => {
      expect(validarAltura(178)).toBeNull();
    });

    it('Esc. 1.3: accepts the exact lower bound', () => {
      expect(validarAltura(100)).toBeNull();
    });

    it('Esc. 1.3: accepts the exact upper bound', () => {
      expect(validarAltura(250)).toBeNull();
    });

    it('Esc. 1.2: rejects a value below the range', () => {
      expect(validarAltura(99)).not.toBeNull();
    });

    it('Esc. 1.2: rejects a value above the range', () => {
      expect(validarAltura(251)).not.toBeNull();
    });

    it('Esc. 1.2: the error message names the admitted range', () => {
      const violacion = validarAltura(30);
      expect(violacion?.mensaje).toContain('100');
      expect(violacion?.mensaje).toContain('250');
      expect(violacion?.mensaje).toContain('cm');
    });

    it('rejects absurd values', () => {
      expect(validarAltura(0)).not.toBeNull();
      expect(validarAltura(-178)).not.toBeNull();
    });
  });

  describe('validarMedidas', () => {
    it('Esc. 1: returns no violations when both values are valid', () => {
      expect(validarMedidas(75, 178)).toEqual([]);
    });

    it('Esc. 1.3: returns no violations on the exact bounds', () => {
      expect(validarMedidas(20, 100)).toEqual([]);
      expect(validarMedidas(250, 250)).toEqual([]);
    });

    it('reports only the weight when the height is valid', () => {
      const violaciones = validarMedidas(10, 178);
      expect(violaciones).toHaveLength(1);
      expect(violaciones[0]?.campo).toBe('weightKg');
    });

    it('reports only the height when the weight is valid', () => {
      const violaciones = validarMedidas(75, 300);
      expect(violaciones).toHaveLength(1);
      expect(violaciones[0]?.campo).toBe('heightCm');
    });

    it('reports both when both are out of range', () => {
      const violaciones = validarMedidas(10, 300);
      expect(violaciones).toHaveLength(2);
      expect(violaciones.map((v) => v.campo)).toEqual(['weightKg', 'heightCm']);
    });
  });
});
