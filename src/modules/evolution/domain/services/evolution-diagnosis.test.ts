import { describe, expect, it } from 'vitest';

import { UMBRALES_POR_DEFECTO } from './diagnostic-thresholds';
import {
  cumplimientoDeSesion,
  diagnosticarEjercicio,
  diagnosticarGlobal,
  esfuerzoMedioDeSesion,
  variacionDelPeriodo,
  type SerieDelDiagnostico,
  type SesionDelDiagnostico,
  type Situacion,
} from './evolution-diagnosis';

const HOY = new Date('2026-11-09T12:00:00Z');

function hace(dias: number): Date {
  return new Date(HOY.getTime() - dias * 24 * 60 * 60 * 1000);
}

function serie(
  overrides: Partial<SerieDelDiagnostico> = {},
): SerieDelDiagnostico {
  return {
    warmup: false,
    additional: false,
    completed: true,
    performedLoad: 100,
    performedRepetitions: 10,
    prescribedMaxRepetitions: 12,
    perceivedEffort: 7,
    ...overrides,
  };
}

function sesion(
  diasAtras: number,
  series: SerieDelDiagnostico[] = [serie()],
): SesionDelDiagnostico {
  return { occurredOn: hace(diasAtras), series };
}

/**
 * Cuatro sesiones con la misma carga: período evaluable, sin progresión.
 *
 * Los días están elegidos para que dos caigan en la primera mitad del período
 * de diagnóstico (días 42 a 21) y dos en la segunda (21 a 0): es el corte
 * temporal con el que RN-74a compara los extremos.
 */
function cuatroSesiones(
  overrides: Partial<SerieDelDiagnostico> = {},
): SesionDelDiagnostico[] {
  return [38, 30, 14, 7].map((dias) => sesion(dias, [serie(overrides)]));
}

describe('cumplimientoDeSesion (RN-69a)', () => {
  it('usa el tope del rango como objetivo', () => {
    const resultado = cumplimientoDeSesion(
      sesion(1, [
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 12 }),
      ]),
    );

    expect(resultado).toBe(100);
  });

  it('el ejemplo del corpus: 12, 10 y 8 sobre 36 = 83,33%', () => {
    const resultado = cumplimientoDeSesion(
      sesion(1, [
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 12 }),
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 10 }),
        serie({ prescribedMaxRepetitions: 12, performedRepetitions: 8 }),
      ]),
    );

    expect(resultado).toBeCloseTo(83.33, 1);
  });

  it('no cuenta calentamiento ni series adicionales', () => {
    const resultado = cumplimientoDeSesion(
      sesion(1, [
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 10 }),
        serie({ warmup: true, performedRepetitions: 20 }),
        serie({ additional: true, performedRepetitions: 20 }),
      ]),
    );

    expect(resultado).toBe(100);
  });

  it('sin series de trabajo declara la ausencia, no devuelve cero', () => {
    expect(
      cumplimientoDeSesion(sesion(1, [serie({ warmup: true })])),
    ).toBeNull();
  });

  it('se acota al 100%: hacer de más no premia', () => {
    const resultado = cumplimientoDeSesion(
      sesion(1, [
        serie({ prescribedMaxRepetitions: 10, performedRepetitions: 20 }),
      ]),
    );

    expect(resultado).toBe(100);
  });
});

describe('esfuerzoMedioDeSesion (RN-81)', () => {
  it('promedia las series de trabajo', () => {
    const resultado = esfuerzoMedioDeSesion(
      sesion(1, [serie({ perceivedEffort: 8 }), serie({ perceivedEffort: 6 })]),
    );

    expect(resultado).toBe(7);
  });

  it('sin esfuerzo registrado devuelve ausencia, no cero', () => {
    // Un esfuerzo de 0 no existe en la escala 1-10: confundirlos convertiría
    // «no lo anotó» en «no le costó nada».
    expect(
      esfuerzoMedioDeSesion(sesion(1, [serie({ perceivedEffort: null })])),
    ).toBeNull();
  });

  it('ignora las series sin esfuerzo y promedia las que lo tienen', () => {
    const resultado = esfuerzoMedioDeSesion(
      sesion(1, [
        serie({ perceivedEffort: 9 }),
        serie({ perceivedEffort: null }),
      ]),
    );

    expect(resultado).toBe(9);
  });
});

describe('variacionDelPeriodo (RN-74a)', () => {
  it('compara la primera mitad con la segunda', () => {
    const sesiones = [
      sesion(38, [serie({ performedLoad: 100 })]),
      sesion(30, [serie({ performedLoad: 100 })]),
      sesion(14, [serie({ performedLoad: 110 })]),
      sesion(7, [serie({ performedLoad: 110 })]),
    ];

    expect(variacionDelPeriodo(sesiones, HOY)).toBe(10);
  });

  it('con una sola sesión no es calculable', () => {
    expect(variacionDelPeriodo([sesion(7)], HOY)).toBeNull();
  });

  it('sin carga estimable en un extremo no es calculable', () => {
    // Peso corporal: válido como registro, pero no produce carga estimada.
    const sesiones = [
      sesion(38, [serie({ performedLoad: 0 })]),
      sesion(7, [serie({ performedLoad: 100 })]),
    ];

    expect(variacionDelPeriodo(sesiones, HOY)).toBeNull();
  });
});

describe('diagnosticarEjercicio · precedencia de RN-79a', () => {
  describe('1 · DATOS_INSUFICIENTES', () => {
    it('con menos de 4 sesiones no se concluye nada', () => {
      const resultado = diagnosticarEjercicio(
        [sesion(30), sesion(14), sesion(7)],
        HOY,
      );

      expect(resultado.situacion).toBe('DATOS_INSUFICIENTES');
    });

    it('4 sesiones ya alcanzan', () => {
      expect(diagnosticarEjercicio(cuatroSesiones(), HOY).situacion).not.toBe(
        'DATOS_INSUFICIENTES',
      );
    });

    it('sin variación calculable tampoco se concluye, y se declara', () => {
      const resultado = diagnosticarEjercicio(
        cuatroSesiones({ performedLoad: 0 }),
        HOY,
      );

      expect(resultado.situacion).toBe('DATOS_INSUFICIENTES');
      expect(resultado.metricas.criteriosNoEvaluados).toContain(
        'variacion_carga_maxima_no_calculable',
      );
    });
  });

  describe('2 · SOBREEXIGENCIA', () => {
    it('cumplimiento bajo en 3 sesiones consecutivas', () => {
      // 6 de 12 repeticiones = 50%, por debajo del 70%.
      const sesiones = [
        sesion(38, [serie()]),
        ...[30, 14, 7].map((d) =>
          sesion(d, [serie({ performedRepetitions: 6 })]),
        ),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'SOBREEXIGENCIA',
      );
    });

    it('esfuerzo alto en 3 sesiones consecutivas', () => {
      const sesiones = [
        sesion(38, [serie()]),
        ...[30, 14, 7].map((d) => sesion(d, [serie({ perceivedEffort: 9 })])),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'SOBREEXIGENCIA',
      );
    });

    it('con 2 sesiones consecutivas todavía no alcanza', () => {
      const sesiones = [
        sesion(38, [serie()]),
        sesion(30, [serie()]),
        ...[14, 7].map((d) => sesion(d, [serie({ perceivedEffort: 9 })])),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).not.toBe(
        'SOBREEXIGENCIA',
      );
    });

    it('gana sobre la progresión aunque la carga esté subiendo', () => {
      // El caso que justifica el orden: sube la carga porque se está
      // excediendo. Tratarlo como progresión lo empujaría a lesionarse.
      const sesiones = [
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(30, [serie({ performedLoad: 100, perceivedEffort: 10 })]),
        ...[14, 7].map((d) =>
          sesion(d, [serie({ performedLoad: 130, perceivedEffort: 10 })]),
        ),
      ];
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.metricas.variacionCargaMaxima).toBeGreaterThan(2.5);
      expect(resultado.situacion).toBe('SOBREEXIGENCIA');
    });

    it('exactamente 70% de cumplimiento NO es sobreexigencia', () => {
      // El umbral es «menor que 70%».
      const sesiones = [38, 30, 14, 7].map((d) =>
        sesion(d, [
          serie({ prescribedMaxRepetitions: 10, performedRepetitions: 7 }),
        ]),
      );

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).not.toBe(
        'SOBREEXIGENCIA',
      );
    });

    it('exactamente 9 de esfuerzo SÍ es sobreexigencia', () => {
      // El umbral es «mayor o igual que 9».
      const sesiones = [
        sesion(38, [serie()]),
        ...[30, 14, 7].map((d) => sesion(d, [serie({ perceivedEffort: 9 })])),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'SOBREEXIGENCIA',
      );
    });
  });

  describe('3 · PROGRESION_ADECUADA', () => {
    it('la carga máxima estimada sube por encima del umbral', () => {
      const sesiones = [
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(30, [serie({ performedLoad: 100 })]),
        sesion(14, [serie({ performedLoad: 110 })]),
        sesion(7, [serie({ performedLoad: 110 })]),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'PROGRESION_ADECUADA',
      );
    });

    it('exactamente +2,5% SÍ es progresión', () => {
      // El umbral es «mayor o igual», al revés que el de estancamiento de
      // HU26. Acá 100 -> 102,5 cuenta como progresar.
      const sesiones = [
        sesion(38, [serie({ performedLoad: 100 })]),
        sesion(30, [serie({ performedLoad: 100 })]),
        sesion(14, [serie({ performedLoad: 102.5 })]),
        sesion(7, [serie({ performedLoad: 102.5 })]),
      ];
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.metricas.variacionCargaMaxima).toBe(2.5);
      expect(resultado.situacion).toBe('PROGRESION_ADECUADA');
    });
  });

  describe('4 · ESTIMULO_INSUFICIENTE', () => {
    it('alcanza el tope del rango sin esfuerzo en las últimas 2 sesiones', () => {
      // El tope se sostiene en todo el período con la carga quieta: así la
      // variación es 0% y la precedencia no lo atrapa antes como progresión.
      // Subir las repeticiones manteniendo la carga sí sube la carga máxima
      // estimada —Epley cuenta las repeticiones— y eso es progresar.
      const comodo = serie({
        performedRepetitions: 12,
        prescribedMaxRepetitions: 12,
        perceivedEffort: 4,
      });
      const sesiones = [38, 30, 14, 7].map((dias) => sesion(dias, [comodo]));
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.metricas.variacionCargaMaxima).toBe(0);
      expect(resultado.situacion).toBe('ESTIMULO_INSUFICIENTE');
    });

    it('si una serie no llegó al tope, no es estímulo insuficiente', () => {
      // Una sola serie por debajo del tope basta: la regla pide **todas**.
      const alTope = serie({ performedRepetitions: 12, perceivedEffort: 4 });
      const sesiones = [
        sesion(38, [alTope]),
        sesion(30, [alTope]),
        sesion(14, [
          alTope,
          serie({ performedRepetitions: 11, perceivedEffort: 4 }),
        ]),
        sesion(7, [alTope]),
      ];

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'ESTANCAMIENTO',
      );
    });

    it('con esfuerzo por encima de 5 no es estímulo insuficiente', () => {
      const sesiones = [38, 30, 14, 7].map((d) =>
        sesion(d, [serie({ performedRepetitions: 12, perceivedEffort: 7 })]),
      );

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'ESTANCAMIENTO',
      );
    });

    it('RN-81: sin esfuerzo registrado la situación igual se detecta', () => {
      // «el esfuerzo percibido medio, **si está registrado**, es ≤ 5»: su
      // ausencia no descarta la situación.
      const sesiones = [38, 30, 14, 7].map((d) =>
        sesion(d, [serie({ performedRepetitions: 12, perceivedEffort: null })]),
      );
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.situacion).toBe('ESTIMULO_INSUFICIENTE');
      expect(resultado.metricas.criteriosNoEvaluados).toContain(
        'esfuerzo_percibido_no_registrado',
      );
    });
  });

  describe('bordes exactos que pide el criterio de aceptación', () => {
    it('esfuerzo exactamente 5 SÍ es estímulo insuficiente', () => {
      // El umbral es «5 o menos»: el 5 entra.
      const sesiones = [38, 30, 14, 7].map((dias) =>
        sesion(dias, [serie({ performedRepetitions: 12, perceivedEffort: 5 })]),
      );

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'ESTIMULO_INSUFICIENTE',
      );
    });

    it('esfuerzo 6 ya no lo es', () => {
      const sesiones = [38, 30, 14, 7].map((dias) =>
        sesion(dias, [serie({ performedRepetitions: 12, perceivedEffort: 6 })]),
      );

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'ESTANCAMIENTO',
      );
    });

    it('cumpliendo 2 y 3 a la vez queda en SOBREEXIGENCIA', () => {
      // Progresa en carga (3) pero con esfuerzo 9 sostenido (2): gana el 2
      // porque está antes en la precedencia.
      const sesiones = [
        sesion(38, [serie({ performedLoad: 100, perceivedEffort: 7 })]),
        sesion(30, [serie({ performedLoad: 100, perceivedEffort: 9 })]),
        ...[14, 7].map((dias) =>
          sesion(dias, [serie({ performedLoad: 130, perceivedEffort: 9 })]),
        ),
      ];
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.metricas.variacionCargaMaxima).toBeGreaterThanOrEqual(
        2.5,
      );
      expect(resultado.situacion).toBe('SOBREEXIGENCIA');
    });

    it('cumpliendo 3 y 4 a la vez queda en PROGRESION_ADECUADA', () => {
      // Llega al tope del rango sin esfuerzo (4) y además sube la carga (3):
      // gana el 3. Progresar no es falta de estímulo, aunque se sienta fácil.
      const comodo = { performedRepetitions: 12, perceivedEffort: 4 };
      const sesiones = [
        sesion(38, [serie({ ...comodo, performedLoad: 100 })]),
        sesion(30, [serie({ ...comodo, performedLoad: 100 })]),
        sesion(14, [serie({ ...comodo, performedLoad: 120 })]),
        sesion(7, [serie({ ...comodo, performedLoad: 120 })]),
      ];
      const resultado = diagnosticarEjercicio(sesiones, HOY);

      expect(resultado.metricas.variacionCargaMaxima).toBeGreaterThanOrEqual(
        2.5,
      );
      expect(resultado.situacion).toBe('PROGRESION_ADECUADA');
    });

    it('cumplimiento exactamente 70% no es sobreexigencia; por debajo sí', () => {
      // Las repeticiones quedan dentro del tope de 12 de RN-65: por encima no
      // hay carga máxima estimada y el ejercicio caería antes en
      // DATOS_INSUFICIENTES, sin llegar a evaluarse este criterio.
      const conReps = (prescriptas: number, ejecutadas: number) =>
        [38, 30, 14, 7].map((dias) =>
          sesion(dias, [
            serie({
              prescribedMaxRepetitions: prescriptas,
              performedRepetitions: ejecutadas,
            }),
          ]),
        );

      // 7 de 10 = exactamente 70%: el umbral es «menor que».
      expect(diagnosticarEjercicio(conReps(10, 7), HOY).situacion).not.toBe(
        'SOBREEXIGENCIA',
      );
      // 8 de 12 = 66,67%: por debajo.
      expect(diagnosticarEjercicio(conReps(12, 8), HOY).situacion).toBe(
        'SOBREEXIGENCIA',
      );
    });
  });

  describe('5 · ESTANCAMIENTO', () => {
    it('ninguna de las anteriores', () => {
      // Carga quieta, cumplimiento normal, esfuerzo medio.
      const sesiones = cuatroSesiones({ performedRepetitions: 10 });

      expect(diagnosticarEjercicio(sesiones, HOY).situacion).toBe(
        'ESTANCAMIENTO',
      );
    });
  });

  it('las métricas sustentan la situación (RN-84)', () => {
    const resultado = diagnosticarEjercicio(cuatroSesiones(), HOY);

    expect(resultado.metricas.sesionesConsideradas).toBe(4);
    expect(resultado.metricas.cumplimientoRepeticionesPorSesion).toHaveLength(
      4,
    );
    expect(resultado.metricas.esfuerzoMedioPorSesion).toHaveLength(4);
  });

  it('los umbrales son inyectables (PD-09)', () => {
    // Con el umbral del corpus serían 4 sesiones; acá alcanzan 2.
    const resultado = diagnosticarEjercicio([sesion(30), sesion(7)], HOY, {
      ...UMBRALES_POR_DEFECTO,
      sesionesMinimas: 2,
    });

    expect(resultado.situacion).not.toBe('DATOS_INSUFICIENTES');
  });
});

describe('diagnosticarGlobal (RN-79a)', () => {
  function entrada(
    situaciones: Situacion[],
    overrides: Partial<Parameters<typeof diagnosticarGlobal>[0]> = {},
  ) {
    return {
      situaciones,
      totalEjercicios: situaciones.length,
      adherencia: 80,
      cumplimientoMedio: 85,
      ...overrides,
    };
  }

  describe('1 · DATOS_INSUFICIENTES', () => {
    it('sin adherencia disponible no se concluye', () => {
      expect(
        diagnosticarGlobal(
          entrada(['PROGRESION_ADECUADA'], { adherencia: null }),
        ),
      ).toBe('DATOS_INSUFICIENTES');
    });

    it('con menos de la mitad de los ejercicios evaluables tampoco', () => {
      // Dos de seis: describe dos ejercicios, no la rutina.
      expect(
        diagnosticarGlobal(
          entrada(
            [
              'PROGRESION_ADECUADA',
              'ESTANCAMIENTO',
              'DATOS_INSUFICIENTES',
              'DATOS_INSUFICIENTES',
              'DATOS_INSUFICIENTES',
              'DATOS_INSUFICIENTES',
            ],
            { totalEjercicios: 6 },
          ),
        ),
      ).toBe('DATOS_INSUFICIENTES');
    });

    it('con exactamente la mitad evaluable sí se concluye', () => {
      expect(
        diagnosticarGlobal(
          entrada(
            [
              'PROGRESION_ADECUADA',
              'PROGRESION_ADECUADA',
              'DATOS_INSUFICIENTES',
              'DATOS_INSUFICIENTES',
            ],
            { totalEjercicios: 4 },
          ),
        ),
      ).toBe('PROGRESION_ADECUADA');
    });

    it('una rutina sin ejercicios no se diagnostica', () => {
      expect(diagnosticarGlobal(entrada([], { totalEjercicios: 0 }))).toBe(
        'DATOS_INSUFICIENTES',
      );
    });
  });

  describe('2 · SOBREEXIGENCIA', () => {
    it('un tercio de los ejercicios en sobreexigencia', () => {
      expect(
        diagnosticarGlobal(
          entrada([
            'SOBREEXIGENCIA',
            'PROGRESION_ADECUADA',
            'PROGRESION_ADECUADA',
          ]),
        ),
      ).toBe('SOBREEXIGENCIA');
    });

    it('adherencia baja con cumplimiento bajo, aunque ningún ejercicio lo esté', () => {
      expect(
        diagnosticarGlobal(
          entrada(['PROGRESION_ADECUADA', 'PROGRESION_ADECUADA'], {
            adherencia: 40,
            cumplimientoMedio: 60,
          }),
        ),
      ).toBe('SOBREEXIGENCIA');
    });

    it('adherencia baja con buen cumplimiento NO es sobreexigencia', () => {
      // Viene poco pero cumple: es un problema de adherencia, no de exceso.
      expect(
        diagnosticarGlobal(
          entrada(['PROGRESION_ADECUADA', 'PROGRESION_ADECUADA'], {
            adherencia: 40,
            cumplimientoMedio: 90,
          }),
        ),
      ).toBe('PROGRESION_ADECUADA');
    });

    it('gana sobre el estancamiento', () => {
      expect(
        diagnosticarGlobal(
          entrada(['SOBREEXIGENCIA', 'ESTANCAMIENTO', 'ESTANCAMIENTO']),
        ),
      ).toBe('SOBREEXIGENCIA');
    });
  });

  describe('3 y 4 · mayorías', () => {
    it('la mitad en estancamiento', () => {
      expect(
        diagnosticarGlobal(
          entrada([
            'ESTANCAMIENTO',
            'ESTANCAMIENTO',
            'PROGRESION_ADECUADA',
            'PROGRESION_ADECUADA',
          ]),
        ),
      ).toBe('ESTANCAMIENTO');
    });

    it('la mitad en estímulo insuficiente', () => {
      expect(
        diagnosticarGlobal(
          entrada([
            'ESTIMULO_INSUFICIENTE',
            'ESTIMULO_INSUFICIENTE',
            'PROGRESION_ADECUADA',
          ]),
        ),
      ).toBe('ESTIMULO_INSUFICIENTE');
    });

    it('el estancamiento gana sobre el estímulo insuficiente', () => {
      expect(
        diagnosticarGlobal(
          entrada([
            'ESTANCAMIENTO',
            'ESTANCAMIENTO',
            'ESTIMULO_INSUFICIENTE',
            'ESTIMULO_INSUFICIENTE',
          ]),
        ),
      ).toBe('ESTANCAMIENTO');
    });
  });

  describe('5 · PROGRESION_ADECUADA', () => {
    it('ninguna de las anteriores', () => {
      expect(
        diagnosticarGlobal(
          entrada(['PROGRESION_ADECUADA', 'PROGRESION_ADECUADA']),
        ),
      ).toBe('PROGRESION_ADECUADA');
    });

    it('los no evaluables no votan', () => {
      // Un solo ejercicio calculable sobre dos: alcanza la mitad y el que
      // cuenta progresa.
      expect(
        diagnosticarGlobal(
          entrada(['PROGRESION_ADECUADA', 'DATOS_INSUFICIENTES'], {
            totalEjercicios: 2,
          }),
        ),
      ).toBe('PROGRESION_ADECUADA');
    });
  });
});
