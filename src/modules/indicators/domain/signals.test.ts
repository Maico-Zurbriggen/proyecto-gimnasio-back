import { describe, expect, it } from 'vitest';

import type { FrecuenciaVigente, SesionDeAdherencia } from './adherence';
import {
  cargaMaximaEstimada,
  cargaMaximaEstimadaDeSerie,
  TOPE_REPETICIONES_ESTIMACION,
} from './estimated-max-load';
import {
  detectarCaidaDeAdherencia,
  detectarDesbalance,
  detectarEstancamiento,
  SESIONES_MINIMAS_ESTANCAMIENTO,
  UMBRAL_CAIDA_ADHERENCIA,
  UMBRAL_VARIACION_ESTANCAMIENTO,
  variacionDeCargaMaxima,
  VOLUMEN_SEMANAL_MAXIMO,
  VOLUMEN_SEMANAL_MINIMO,
  type SesionDelPeriodo,
} from './signals';
import { volumenPorGrupo, type SerieConMusculos } from './volume';

const HOY = new Date('2026-10-21T12:00:00Z');
const PRESS = 'ejercicio-press';

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

/** Serie de trabajo completada del ejercicio indicado. */
function serie(
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

function sesion(
  diasAtras: number,
  series: SesionDelPeriodo['series'][number][] = [serie()],
): SesionDelPeriodo {
  return { occurredOn: hace(diasAtras), completada: true, series };
}

describe('estimated-max-load (RN-65, RN-66)', () => {
  it('aplica la fórmula de Epley', () => {
    // 100 × (1 + 5/30) = 116,67
    expect(
      cargaMaximaEstimadaDeSerie({
        warmup: false,
        completed: true,
        performedLoad: 100,
        performedRepetitions: 5,
      }),
    ).toBeCloseTo(116.67, 1);
  });

  it('RN-65: no estima por encima de 12 repeticiones', () => {
    expect(TOPE_REPETICIONES_ESTIMACION).toBe(12);
    expect(
      cargaMaximaEstimadaDeSerie({
        warmup: false,
        completed: true,
        performedLoad: 60,
        performedRepetitions: 13,
      }),
    ).toBeNull();
  });

  it('CB-42: carga cero no admite estimación', () => {
    // Un ejercicio de peso corporal aporta volumen, pero no carga máxima.
    expect(
      cargaMaximaEstimadaDeSerie({
        warmup: false,
        completed: true,
        performedLoad: 0,
        performedRepetitions: 10,
      }),
    ).toBeNull();
  });

  it('ignora calentamiento y series no completadas', () => {
    const base = { performedLoad: 100, performedRepetitions: 5 };
    expect(
      cargaMaximaEstimadaDeSerie({ ...base, warmup: true, completed: true }),
    ).toBeNull();
    expect(
      cargaMaximaEstimadaDeSerie({ ...base, warmup: false, completed: false }),
    ).toBeNull();
  });

  it('RN-66: toma la mayor de las series', () => {
    const series = [
      {
        warmup: false,
        completed: true,
        performedLoad: 80,
        performedRepetitions: 5,
      },
      {
        warmup: false,
        completed: true,
        performedLoad: 100,
        performedRepetitions: 5,
      },
    ];
    expect(cargaMaximaEstimada(series)).toBeCloseTo(116.67, 1);
  });

  it('RN-73: devuelve null si nada es estimable, no cero', () => {
    expect(cargaMaximaEstimada([])).toBeNull();
  });
});

describe('volume (RN-62, RN-63)', () => {
  function serieMuscular(
    musculos: SerieConMusculos['musculos'],
    overrides: Partial<SerieConMusculos> = {},
  ): SerieConMusculos {
    return { warmup: false, completed: true, musculos, ...overrides };
  }

  it('suma 1,0 al primario y 0,5 a cada secundario', () => {
    const volumen = volumenPorGrupo([
      serieMuscular([
        { grupo: 'PECTORAL', participacion: 'PRIMARIA' },
        { grupo: 'TRICEPS', participacion: 'SECUNDARIA' },
        { grupo: 'DELTOIDES_ANTERIOR', participacion: 'SECUNDARIA' },
      ]),
    ]);

    expect(volumen.get('PECTORAL')).toBe(1);
    expect(volumen.get('TRICEPS')).toBe(0.5);
    expect(volumen.get('DELTOIDES_ANTERIOR')).toBe(0.5);
  });

  it('acumula sobre varias series', () => {
    const una = serieMuscular([{ grupo: 'DORSAL', participacion: 'PRIMARIA' }]);
    expect(volumenPorGrupo([una, una, una]).get('DORSAL')).toBe(3);
  });

  it('RN-54: el calentamiento no aporta volumen', () => {
    const volumen = volumenPorGrupo([
      serieMuscular([{ grupo: 'DORSAL', participacion: 'PRIMARIA' }], {
        warmup: true,
      }),
    ]);
    expect(volumen.size).toBe(0);
  });

  it('RN-30: un ejercicio sin clasificar no aporta a ningún grupo', () => {
    // Y esa ausencia se distingue de aportar cero: el grupo no aparece.
    const volumen = volumenPorGrupo([serieMuscular([])]);
    expect(volumen.size).toBe(0);
  });
});

describe('variacionDeCargaMaxima (RN-74a)', () => {
  it('compara las últimas 3 semanas contra las primeras 3', () => {
    const sesiones = [
      sesion(38, [serie({ performedLoad: 100 })]),
      sesion(5, [serie({ performedLoad: 110 })]),
    ];
    // (116,67 → 128,33) / 116,67 = +10%
    expect(variacionDeCargaMaxima(sesiones, PRESS, HOY)).toBeCloseTo(10, 0);
  });

  it('RN-74a: no es calculable si falta uno de los extremos', () => {
    const soloRecientes = [sesion(5), sesion(3)];
    expect(variacionDeCargaMaxima(soloRecientes, PRESS, HOY)).toBeNull();
  });

  it('detecta una variación negativa', () => {
    const sesiones = [
      sesion(38, [serie({ performedLoad: 110 })]),
      sesion(5, [serie({ performedLoad: 100 })]),
    ];
    expect(variacionDeCargaMaxima(sesiones, PRESS, HOY)).toBeLessThan(0);
  });
});

describe('detectarEstancamiento (RN-74)', () => {
  it('el umbral es +2,5% con al menos 4 sesiones', () => {
    expect(UMBRAL_VARIACION_ESTANCAMIENTO).toBe(2.5);
    expect(SESIONES_MINIMAS_ESTANCAMIENTO).toBe(4);
  });

  it('RN-77: sin el mínimo de sesiones no emite señal, declara la falta', () => {
    const resultado = detectarEstancamiento(
      [sesion(30), sesion(20), sesion(5)],
      PRESS,
      HOY,
    );

    expect(resultado.estado).toBe('DATOS_INSUFICIENTES');
    if (resultado.estado === 'DATOS_INSUFICIENTES') {
      expect(resultado.falta).toContain('4 sesiones');
    }
  });

  it('detecta estancamiento cuando la carga no sube', () => {
    const sesiones = [
      sesion(40, [serie({ performedLoad: 100 })]),
      sesion(38, [serie({ performedLoad: 100 })]),
      sesion(5, [serie({ performedLoad: 101 })]),
      sesion(3, [serie({ performedLoad: 101 })]),
    ];
    const resultado = detectarEstancamiento(sesiones, PRESS, HOY);

    expect(resultado.estado).toBe('DETECTADA');
    if (resultado.estado === 'DETECTADA') {
      expect(resultado.detalle.variacionPorcentual).toBeLessThan(2.5);
      expect(resultado.detalle.sesionesConsideradas).toBe(4);
    }
  });

  describe('casos límite del umbral (criterio 3)', () => {
    // Epley con 5 repeticiones: carga x (1 + 5/30) = carga x 1,1667. La
    // variación porcentual entre dos cargas es la de las cargas mismas, así
    // que 100 -> 102,5 da exactamente +2,5%.
    it('exactamente +2,5% NO es estancamiento', () => {
      const sesiones = [
        sesion(40, [serie({ performedLoad: 100 })]),
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 102.5 })]),
        sesion(3, [serie({ performedLoad: 102.5 })]),
      ];
      const resultado = detectarEstancamiento(sesiones, PRESS, HOY);

      expect(variacionDeCargaMaxima(sesiones, PRESS, HOY)).toBe(2.5);
      expect(resultado.estado).toBe('SIN_SENAL');
    });

    it('justo por debajo de +2,5% sí es estancamiento', () => {
      const sesiones = [
        sesion(40, [serie({ performedLoad: 100 })]),
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 102.4 })]),
        sesion(3, [serie({ performedLoad: 102.4 })]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DETECTADA',
      );
    });

    it('3 sesiones no alcanzan', () => {
      const sesiones = [
        sesion(40, [serie({ performedLoad: 100 })]),
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 100 })]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('4 sesiones sí alcanzan', () => {
      const sesiones = [
        sesion(40, [serie({ performedLoad: 100 })]),
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 100 })]),
        sesion(3, [serie({ performedLoad: 100 })]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DETECTADA',
      );
    });
  });

  describe('RN-65 · qué series son estimables (criterio 4)', () => {
    it('un ejercicio de peso corporal no es evaluable', () => {
      // Carga 0: válida como registro y aporta volumen, pero no produce carga
      // máxima estimada (CB-42), así que no hay con qué medir progresión.
      const sesiones = [
        sesion(40, [serie({ performedLoad: 0 })]),
        sesion(38, [serie({ performedLoad: 0 })]),
        sesion(5, [serie({ performedLoad: 0 })]),
        sesion(3, [serie({ performedLoad: 0 })]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('series de más de 12 repeticiones no son evaluables', () => {
      const muchasReps = { performedLoad: 100, performedRepetitions: 15 };
      const sesiones = [
        sesion(40, [serie(muchasReps)]),
        sesion(38, [serie(muchasReps)]),
        sesion(5, [serie(muchasReps)]),
        sesion(3, [serie(muchasReps)]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('exactamente 12 repeticiones sí son evaluables', () => {
      const doce = { performedLoad: 100, performedRepetitions: 12 };
      const sesiones = [
        sesion(40, [serie(doce)]),
        sesion(38, [serie(doce)]),
        sesion(5, [serie(doce)]),
        sesion(3, [serie(doce)]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DETECTADA',
      );
    });

    it('una serie no completada no cuenta para la estimación', () => {
      const sesiones = [
        sesion(40, [serie({ completed: false })]),
        sesion(38, [serie({ completed: false })]),
        sesion(5, [serie({ completed: false })]),
        sesion(3, [serie({ completed: false })]),
      ];

      expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('RN-74a: si falta uno de los dos extremos no es calculable', () => {
      // Cuatro sesiones, todas en el tramo reciente: no hay con qué comparar.
      const sesiones = [
        sesion(10, [serie({ performedLoad: 100 })]),
        sesion(8, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 100 })]),
        sesion(3, [serie({ performedLoad: 100 })]),
      ];
      const resultado = detectarEstancamiento(sesiones, PRESS, HOY);

      expect(resultado.estado).toBe('DATOS_INSUFICIENTES');
      if (resultado.estado === 'DATOS_INSUFICIENTES') {
        expect(resultado.falta).toContain('no es calculable');
      }
    });
  });

  it('no hay señal cuando la carga progresa por encima del umbral', () => {
    const sesiones = [
      sesion(40, [serie({ performedLoad: 100 })]),
      sesion(38, [serie({ performedLoad: 100 })]),
      sesion(5, [serie({ performedLoad: 120 })]),
      sesion(3, [serie({ performedLoad: 120 })]),
    ];
    expect(detectarEstancamiento(sesiones, PRESS, HOY).estado).toBe(
      'SIN_SENAL',
    );
  });

  it('«sin señal» y «datos insuficientes» son estados distintos', () => {
    // RN-77: la ausencia por falta de datos no es la ausencia por normalidad.
    const pocas = detectarEstancamiento([sesion(5)], PRESS, HOY);
    const progresa = detectarEstancamiento(
      [
        sesion(40, [serie({ performedLoad: 100 })]),
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(5, [serie({ performedLoad: 130 })]),
        sesion(3, [serie({ performedLoad: 130 })]),
      ],
      PRESS,
      HOY,
    );

    expect(pocas.estado).not.toBe(progresa.estado);
  });
});

describe('detectarCaidaDeAdherencia (RN-75)', () => {
  const frecuencia: FrecuenciaVigente[] = [
    { desde: hace(90), hasta: null, sesionesPorSemana: 4 },
  ];

  function asistencias(dias: readonly number[]): SesionDeAdherencia[] {
    return dias.map((d) => ({ occurredOn: hace(d), completada: true }));
  }

  it('el umbral es de 25 puntos porcentuales', () => {
    expect(UMBRAL_CAIDA_ADHERENCIA).toBe(25);
  });

  it('detecta la caída cuando el alumno deja de venir', () => {
    // RN-110: los tramos son semanas calendario. El reciente va del lunes 5 al
    // domingo 18 de octubre (días 3 a 16 atrás) y el previo las dos semanas
    // anteriores (días 17 a 30). Ocho sesiones en el previo, ninguna en el
    // reciente.
    const resultado = detectarCaidaDeAdherencia(
      asistencias([17, 18, 19, 20, 21, 22, 23, 24]),
      frecuencia,
      HOY,
    );

    expect(resultado.estado).toBe('DETECTADA');
    if (resultado.estado === 'DETECTADA') {
      expect(resultado.detalle.caidaEnPuntos).toBeGreaterThanOrEqual(25);
      expect(resultado.detalle.adherenciaReciente).toBe(0);
    }
  });

  describe('casos límite del umbral: 24, 25 y 26 puntos (criterio 5)', () => {
    // Frecuencia 4/semana: cada tramo de dos semanas espera 8 sesiones, así
    // que cada sesión vale 12,5 puntos. Para medir puntos exactos se usa una
    // frecuencia de 50/semana (100 esperadas por tramo, 1 punto por sesión).
    const porPunto: FrecuenciaVigente[] = [
      { desde: hace(90), hasta: null, sesionesPorSemana: 50 },
    ];

    /** `n` sesiones dentro del tramo indicado, repartidas día por medio. */
    function enTramo(n: number, desde: number): SesionDeAdherencia[] {
      return Array.from({ length: n }, (_, i) => ({
        occurredOn: hace(desde + (i % 14)),
        completada: true,
      }));
    }

    it('una caída de 24 puntos NO se señala', () => {
      const resultado = detectarCaidaDeAdherencia(
        [...enTramo(50, 17), ...enTramo(26, 3)],
        porPunto,
        HOY,
      );

      expect(resultado.estado).toBe('SIN_SENAL');
    });

    it('una caída de exactamente 25 puntos SÍ se señala', () => {
      const resultado = detectarCaidaDeAdherencia(
        [...enTramo(50, 17), ...enTramo(25, 3)],
        porPunto,
        HOY,
      );

      expect(resultado.estado).toBe('DETECTADA');
      if (resultado.estado === 'DETECTADA') {
        expect(resultado.detalle.caidaEnPuntos).toBe(25);
      }
    });

    it('una caída de 26 puntos se señala', () => {
      const resultado = detectarCaidaDeAdherencia(
        [...enTramo(50, 17), ...enTramo(24, 3)],
        porPunto,
        HOY,
      );

      expect(resultado.estado).toBe('DETECTADA');
      if (resultado.estado === 'DETECTADA') {
        expect(resultado.detalle.caidaEnPuntos).toBe(26);
      }
    });
  });

  it('no hay señal cuando la asistencia se sostiene', () => {
    const constante = asistencias([
      1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27,
    ]);
    expect(detectarCaidaDeAdherencia(constante, frecuencia, HOY).estado).toBe(
      'SIN_SENAL',
    );
  });

  it('RN-77: sin adherencia calculable declara la falta', () => {
    const resultado = detectarCaidaDeAdherencia([], [], HOY);

    expect(resultado.estado).toBe('DATOS_INSUFICIENTES');
  });
});

describe('detectarDesbalance (RN-76)', () => {
  it('el rango es de 6 a 22 series semanales', () => {
    expect(VOLUMEN_SEMANAL_MINIMO).toBe(6);
    expect(VOLUMEN_SEMANAL_MAXIMO).toBe(22);
  });

  it('detecta desbalance por defecto', () => {
    // Cuatro series primarias en cuatro semanas: 1 serie semanal.
    const sesiones = [sesion(3), sesion(10), sesion(17), sesion(24)];
    const resultado = detectarDesbalance(sesiones, HOY);

    expect(resultado.estado).toBe('DETECTADA');
    if (resultado.estado === 'DETECTADA') {
      const pectoral = resultado.detalle.find((d) => d.grupo === 'PECTORAL');
      expect(pectoral?.tipo).toBe('POR_DEFECTO');
      expect(pectoral?.seriesSemanales).toBe(1);
    }
  });

  describe('casos límite del rango: 6 y 22 (criterio 7)', () => {
    /** `n` series primarias por semana durante cuatro semanas. */
    function semanalmente(n: number): SesionDelPeriodo[] {
      const series = Array.from({ length: n }, () => serie());
      return [3, 10, 17, 24].map((d) => sesion(d, series));
    }

    it('exactamente 6 series semanales NO es desbalance', () => {
      expect(detectarDesbalance(semanalmente(6), HOY).estado).toBe('SIN_SENAL');
    });

    it('5 series semanales es desbalance por defecto', () => {
      const resultado = detectarDesbalance(semanalmente(5), HOY);

      expect(resultado.estado).toBe('DETECTADA');
      if (resultado.estado === 'DETECTADA') {
        expect(resultado.detalle[0]?.tipo).toBe('POR_DEFECTO');
      }
    });

    it('exactamente 22 series semanales NO es desbalance', () => {
      expect(detectarDesbalance(semanalmente(22), HOY).estado).toBe(
        'SIN_SENAL',
      );
    });

    it('23 series semanales es desbalance por exceso', () => {
      const resultado = detectarDesbalance(semanalmente(23), HOY);

      expect(resultado.estado).toBe('DETECTADA');
      if (resultado.estado === 'DETECTADA') {
        expect(resultado.detalle[0]?.tipo).toBe('POR_EXCESO');
      }
    });
  });

  it('detecta desbalance por exceso', () => {
    // 100 series primarias en cuatro semanas: 25 semanales.
    const muchas = Array.from({ length: 25 }, () => serie());
    const sesiones = [
      sesion(3, muchas),
      sesion(10, muchas),
      sesion(17, muchas),
      sesion(24, muchas),
    ];
    const resultado = detectarDesbalance(sesiones, HOY);

    if (resultado.estado === 'DETECTADA') {
      const pectoral = resultado.detalle.find((d) => d.grupo === 'PECTORAL');
      expect(pectoral?.tipo).toBe('POR_EXCESO');
    }
  });

  it('no hay señal dentro del rango', () => {
    // 10 series por sesión × 4 sesiones / 4 semanas = 10 semanales.
    const diez = Array.from({ length: 10 }, () => serie());
    const sesiones = [
      sesion(3, diez),
      sesion(10, diez),
      sesion(17, diez),
      sesion(24, diez),
    ];
    expect(detectarDesbalance(sesiones, HOY).estado).toBe('SIN_SENAL');
  });

  it('RN-77: sin sesiones en el período declara la falta', () => {
    const resultado = detectarDesbalance([], HOY);

    expect(resultado.estado).toBe('DATOS_INSUFICIENTES');
    if (resultado.estado === 'DATOS_INSUFICIENTES') {
      expect(resultado.falta).toContain('sesiones completadas');
    }
  });

  it('RN-30: con ejercicios sin clasificar declara la falta, no desbalance', () => {
    const sinClasificar = [sesion(3, [serie({ musculos: [] })])];
    const resultado = detectarDesbalance(sinClasificar, HOY);

    expect(resultado.estado).toBe('DATOS_INSUFICIENTES');
    if (resultado.estado === 'DATOS_INSUFICIENTES') {
      expect(resultado.falta).toContain('clasificación muscular');
    }
  });
});
