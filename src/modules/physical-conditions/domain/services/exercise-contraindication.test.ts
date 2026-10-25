import { describe, expect, it } from 'vitest';

import {
  evaluarContraindicacion,
  impideVigencia,
  proximoEstado,
  type CondicionVigente,
  type ZonasDelEjercicio,
} from './exercise-contraindication';

const SENTADILLA: ZonasDelEjercicio = {
  musculos: ['CUADRICEPS', 'GLUTEO'],
  articulaciones: ['RODILLA', 'CADERA'],
};

const PRESS_BANCA: ZonasDelEjercicio = {
  musculos: ['PECTORAL', 'TRICEPS'],
  articulaciones: ['HOMBRO', 'CODO'],
};

function condicion(
  bodyZoneCode: CondicionVigente['bodyZoneCode'],
  severity: CondicionVigente['severity'],
): CondicionVigente {
  return { bodyZoneCode, severity };
}

describe('impideVigencia (RN-44b)', () => {
  it('LEVE señala pero no impide', () => {
    expect(impideVigencia('LEVE')).toBe(false);
  });

  it('MODERADA y SEVERA impiden', () => {
    expect(impideVigencia('MODERADA')).toBe(true);
    expect(impideVigencia('SEVERA')).toBe(true);
  });
});

describe('evaluarContraindicacion (RN-44a, criterio 22)', () => {
  it('sin condiciones no hay contraindicación', () => {
    expect(evaluarContraindicacion(SENTADILLA, [])).toBeNull();
  });

  it('una condición de otra zona no alcanza al ejercicio', () => {
    expect(
      evaluarContraindicacion(SENTADILLA, [condicion('HOMBRO', 'SEVERA')]),
    ).toBeNull();
  });

  it('LEVE en una articulación del ejercicio lo deja ADVERTIDO', () => {
    const resultado = evaluarContraindicacion(SENTADILLA, [
      condicion('RODILLA', 'LEVE'),
    ]);

    expect(resultado?.estado).toBe('ADVERTIDO');
    expect(resultado?.motivo).toContain('RODILLA');
  });

  it('MODERADA lo deja INCOMPATIBLE', () => {
    expect(
      evaluarContraindicacion(PRESS_BANCA, [condicion('HOMBRO', 'MODERADA')])
        ?.estado,
    ).toBe('INCOMPATIBLE');
  });

  it('SEVERA lo deja INCOMPATIBLE', () => {
    expect(
      evaluarContraindicacion(PRESS_BANCA, [condicion('HOMBRO', 'SEVERA')])
        ?.estado,
    ).toBe('INCOMPATIBLE');
  });

  it('alcanza por grupo muscular, no sólo por articulación', () => {
    expect(
      evaluarContraindicacion(SENTADILLA, [condicion('CUADRICEPS', 'LEVE')])
        ?.estado,
    ).toBe('ADVERTIDO');
  });

  it('con varias condiciones gana la más restrictiva', () => {
    // Rodilla LEVE y cadera MODERADA en el mismo ejercicio: manda la que
    // impide, no la que señala.
    const resultado = evaluarContraindicacion(SENTADILLA, [
      condicion('RODILLA', 'LEVE'),
      condicion('CADERA', 'MODERADA'),
    ]);

    expect(resultado?.estado).toBe('INCOMPATIBLE');
    expect(resultado?.motivo).toContain('CADERA');
  });

  it('el motivo nombra la zona y la severidad que lo originaron (criterio 10)', () => {
    const resultado = evaluarContraindicacion(SENTADILLA, [
      condicion('RODILLA', 'MODERADA'),
    ]);

    expect(resultado?.motivo).toContain('MODERADA');
    expect(resultado?.motivo).toContain('RODILLA');
    expect(resultado?.motivo).toContain('RN-44b');
  });
});

describe('proximoEstado', () => {
  const sinMarca = { estado: 'COMPATIBLE' as const, motivo: null };

  it('marca un ejercicio que pasa a estar contraindicado', () => {
    const siguiente = proximoEstado(sinMarca, {
      estado: 'ADVERTIDO',
      motivo: 'Condicion LEVE en RODILLA: se senala, no impide (RN-44b).',
    });

    expect(siguiente?.estado).toBe('ADVERTIDO');
  });

  it('no escribe cuando el estado ya es el correcto', () => {
    const motivo = 'Condicion LEVE en RODILLA: se senala, no impide (RN-44b).';

    expect(
      proximoEstado(
        { estado: 'ADVERTIDO', motivo },
        { estado: 'ADVERTIDO', motivo },
      ),
    ).toBeNull();
  });

  it('al cerrarse la condición devuelve el ejercicio a COMPATIBLE', () => {
    const siguiente = proximoEstado(
      {
        estado: 'ADVERTIDO',
        motivo: 'Condicion LEVE en RODILLA: se senala, no impide (RN-44b).',
      },
      null,
    );

    expect(siguiente).toEqual({ estado: 'COMPATIBLE', motivo: null });
  });

  it('no toca un ejercicio que nunca marcó una condición', () => {
    expect(proximoEstado(sinMarca, null)).toBeNull();
  });

  it('RN-44d: no revierte un INCOMPATIBLE por equipamiento ausente', () => {
    // Esa causa sigue vigente aunque la condición se haya cerrado: cerrarla no
    // hace aparecer la polea que falta.
    const porEquipo = {
      estado: 'INCOMPATIBLE' as const,
      motivo: 'Equipamiento ausente: POLEA_ALTA',
    };

    expect(proximoEstado(porEquipo, null)).toBeNull();
  });

  it('un INCOMPATIBLE por equipamiento no baja a ADVERTIDO por una condición leve', () => {
    const porEquipo = {
      estado: 'INCOMPATIBLE' as const,
      motivo: 'Equipamiento ausente: POLEA_ALTA',
    };

    expect(
      proximoEstado(porEquipo, {
        estado: 'ADVERTIDO',
        motivo: 'Condicion LEVE en DORSAL: se senala, no impide (RN-44b).',
      }),
    ).toBeNull();
  });

  it('pero una condición impeditiva sí agrava un ejercicio sin marca', () => {
    const siguiente = proximoEstado(sinMarca, {
      estado: 'INCOMPATIBLE',
      motivo: 'Condicion MODERADA en HOMBRO impide la vigencia (RN-44b).',
    });

    expect(siguiente?.estado).toBe('INCOMPATIBLE');
  });

  it('un ejercicio desactivado del catálogo no se mejora', () => {
    const desactivado = {
      estado: 'EJERCICIO_DESACTIVADO' as const,
      motivo: 'El ejercicio fue dado de baja',
    };

    expect(
      proximoEstado(desactivado, {
        estado: 'ADVERTIDO',
        motivo: 'Condicion LEVE en RODILLA: se senala, no impide (RN-44b).',
      }),
    ).toBeNull();
  });

  it('agravar una condición de LEVE a MODERADA reescribe el motivo', () => {
    const siguiente = proximoEstado(
      {
        estado: 'ADVERTIDO',
        motivo: 'Condicion LEVE en RODILLA: se senala, no impide (RN-44b).',
      },
      {
        estado: 'INCOMPATIBLE',
        motivo: 'Condicion MODERADA en RODILLA impide la vigencia (RN-44b).',
      },
    );

    expect(siguiente?.estado).toBe('INCOMPATIBLE');
    expect(siguiente?.motivo).toContain('MODERADA');
  });
});
