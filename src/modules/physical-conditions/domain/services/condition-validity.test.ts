import { describe, expect, it } from 'vitest';

import {
  ARTICULACIONES,
  esZonaCorporalValida,
  GRUPOS_MUSCULARES,
  severidadImpide,
  ZONAS_CORPORALES,
} from './body-zones';
import {
  estabaVigenteEn,
  fechaDeInicioAdmisible,
  puedeCerrarse,
  vigentesEn,
} from './condition-validity';

describe('body-zones (HU11 - T1)', () => {
  it('la zona corporal es la unión de grupos musculares y articulaciones', () => {
    expect(GRUPOS_MUSCULARES).toHaveLength(17);
    expect(ARTICULACIONES).toHaveLength(8);
    expect(ZONAS_CORPORALES).toHaveLength(25);
  });

  it('acepta un grupo muscular como zona', () => {
    expect(esZonaCorporalValida('ISQUIOTIBIALES')).toBe(true);
  });

  it('acepta una articulación como zona', () => {
    expect(esZonaCorporalValida('RODILLA')).toBe(true);
  });

  it('rechaza un valor fuera de la enumeración cerrada', () => {
    expect(esZonaCorporalValida('ESPALDA_BAJA')).toBe(false);
    expect(esZonaCorporalValida('rodilla')).toBe(false);
    expect(esZonaCorporalValida('')).toBe(false);
  });

  it('MODERADA y SEVERA impiden; LEVE sólo advierte (RN-44b)', () => {
    expect(severidadImpide('LEVE')).toBe(false);
    expect(severidadImpide('MODERADA')).toBe(true);
    expect(severidadImpide('SEVERA')).toBe(true);
  });
});

describe('condition-validity (HU11 - T2)', () => {
  const hoy = new Date('2026-10-05T12:00:00Z');

  describe('estabaVigenteEn', () => {
    it('una condición abierta rige desde su inicio', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: null,
      };
      expect(estabaVigenteEn(condicion, hoy)).toBe(true);
    });

    it('rige el mismo día en que empieza', () => {
      const condicion = {
        startsOn: new Date('2026-10-05T00:00:00Z'),
        endsOn: null,
      };
      expect(estabaVigenteEn(condicion, hoy)).toBe(true);
    });

    it('no rige antes de empezar', () => {
      const condicion = {
        startsOn: new Date('2026-10-06T00:00:00Z'),
        endsOn: null,
      };
      expect(estabaVigenteEn(condicion, hoy)).toBe(false);
    });

    it('una condición cerrada no rige después de su cierre', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: new Date('2026-09-30T00:00:00Z'),
      };
      expect(estabaVigenteEn(condicion, hoy)).toBe(false);
    });

    it('rige el mismo día en que se cierra', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: new Date('2026-10-05T00:00:00Z'),
      };
      expect(estabaVigenteEn(condicion, hoy)).toBe(true);
    });

    it('responde qué regía en una fecha pasada, no sólo hoy (RF-085)', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: new Date('2026-09-30T00:00:00Z'),
      };
      // Cerrada hoy, pero vigente el 15 de septiembre: es la pregunta que
      // sostiene la auditoría de una prescripción pasada.
      expect(estabaVigenteEn(condicion, new Date('2026-09-15T00:00:00Z'))).toBe(
        true,
      );
    });

    it('ignora la hora del día', () => {
      const condicion = {
        startsOn: new Date('2026-10-05T23:00:00Z'),
        endsOn: null,
      };
      expect(estabaVigenteEn(condicion, new Date('2026-10-05T01:00:00Z'))).toBe(
        true,
      );
    });
  });

  describe('vigentesEn', () => {
    const condiciones = [
      { id: '1', startsOn: new Date('2026-09-01T00:00:00Z'), endsOn: null },
      {
        id: '2',
        startsOn: new Date('2026-08-01T00:00:00Z'),
        endsOn: new Date('2026-09-15T00:00:00Z'),
      },
      { id: '3', startsOn: new Date('2026-10-20T00:00:00Z'), endsOn: null },
    ];

    it('devuelve sólo las que rigen hoy', () => {
      expect(vigentesEn(condiciones, hoy).map((c) => c.id)).toEqual(['1']);
    });

    it('varias pueden estar vigentes a la vez (RN-10)', () => {
      const enSeptiembre = vigentesEn(
        condiciones,
        new Date('2026-09-10T00:00:00Z'),
      );
      expect(enSeptiembre.map((c) => c.id)).toEqual(['1', '2']);
    });

    it('devuelve vacío cuando ninguna regía', () => {
      expect(vigentesEn(condiciones, new Date('2026-01-01T00:00:00Z'))).toEqual(
        [],
      );
    });
  });

  describe('puedeCerrarse', () => {
    it('una condición abierta puede cerrarse hoy', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: null,
      };
      expect(puedeCerrarse(condicion, hoy)).toBe(true);
    });

    it('no se cierra el mismo día en que empezó', () => {
      // La base exige ends_on > starts_on: un período de duración cero no es
      // interpretable. Una condición declarada hoy se cierra desde mañana.
      const condicion = {
        startsOn: new Date('2026-10-05T00:00:00Z'),
        endsOn: null,
      };
      expect(puedeCerrarse(condicion, hoy)).toBe(false);
    });

    it('puede cerrarse al día siguiente de empezar', () => {
      const condicion = {
        startsOn: new Date('2026-10-04T00:00:00Z'),
        endsOn: null,
      };
      expect(puedeCerrarse(condicion, hoy)).toBe(true);
    });

    it('una ya cerrada no se vuelve a cerrar', () => {
      const condicion = {
        startsOn: new Date('2026-09-01T00:00:00Z'),
        endsOn: new Date('2026-09-30T00:00:00Z'),
      };
      expect(puedeCerrarse(condicion, hoy)).toBe(false);
    });

    it('no se cierra antes de su inicio (RI-17)', () => {
      const condicion = {
        startsOn: new Date('2026-10-05T00:00:00Z'),
        endsOn: null,
      };
      expect(puedeCerrarse(condicion, new Date('2026-10-01T00:00:00Z'))).toBe(
        false,
      );
    });
  });

  describe('fechaDeInicioAdmisible', () => {
    it('acepta una fecha pasada', () => {
      expect(
        fechaDeInicioAdmisible(new Date('2026-09-01T00:00:00Z'), hoy),
      ).toBe(true);
    });

    it('acepta hoy', () => {
      expect(
        fechaDeInicioAdmisible(new Date('2026-10-05T00:00:00Z'), hoy),
      ).toBe(true);
    });

    it('rechaza una fecha futura', () => {
      expect(
        fechaDeInicioAdmisible(new Date('2026-10-06T00:00:00Z'), hoy),
      ).toBe(false);
    });
  });
});
