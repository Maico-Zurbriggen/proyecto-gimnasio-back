import { describe, expect, it } from 'vitest';

import {
  ceilToStep,
  elaborateAdjustments,
  floorToStep,
  increasedLoad,
  reducedLoad,
  type DiagnosticInput,
  type ExerciseFinding,
  type SetSnapshot,
} from './adjustment-table';

const set = (
  position: number,
  overrides: Partial<SetSnapshot> = {},
): SetSnapshot => ({
  position,
  minRepetitions: 6,
  maxRepetitions: 8,
  suggestedLoad: 60,
  restSeconds: 90,
  warmup: false,
  ...overrides,
});

function finding(overrides: Partial<ExerciseFinding> = {}): ExerciseFinding {
  return {
    routineExerciseId: 're-1',
    exerciseId: 'ex-1',
    exerciseName: 'Press banca',
    situation: 'PROGRESION_ADECUADA',
    compatibilityState: 'COMPATIBLE',
    consecutiveStagnations: 0,
    sets: [set(1), set(2), set(3)],
    metrics: { e1rm: 80 },
    alternativeExerciseId: 'ex-alt',
    alternativeExerciseName: 'Press inclinado',
    ...overrides,
  };
}

function diagnostic(
  exercises: ExerciseFinding[],
  overrides: Partial<DiagnosticInput> = {},
): DiagnosticInput {
  return {
    diagnosticId: 'd-1',
    globalSituation: 'PROGRESION_ADECUADA',
    adherence: 80,
    routine: {
      routineType: 'HIPERTROFIA',
      targetWeeklyFrequency: 4,
      exercisesPerDay: [5, 5, 5, 5],
    },
    exercises,
    global: { lowAdherenceWeeks: 0, imbalances: [], goalChange: null },
    ...overrides,
  };
}

const elaborate = (
  exercises: ExerciseFinding[],
  overrides: Partial<DiagnosticInput> = {},
) => elaborateAdjustments(diagnostic(exercises, overrides));

describe('rounding helpers', () => {
  it('rounds to multiples of 2.5 kg without float noise', () => {
    expect(ceilToStep(61.5, 2.5)).toBe(62.5);
    expect(ceilToStep(62.5, 2.5)).toBe(62.5);
    expect(floorToStep(54, 2.5)).toBe(52.5);
    expect(floorToStep(45, 2.5)).toBe(45);
  });
});

describe('tabla situación → ajuste: por ejercicio', () => {
  it.each(['PROGRESION_ADECUADA', 'DATOS_INSUFICIENTES'] as const)(
    '%s no produce ajuste',
    (situation) => {
      const result = elaborate([finding({ situation })]);
      expect(result.adjustments).toEqual([]);
      expect(result.status).toBe('SIN_AJUSTES');
    },
  );

  it('ESTIMULO_INSUFICIENTE: carga +2,5 % al alza a múltiplo de 2,5 (60 → 62,5)', () => {
    const result = elaborate([finding({ situation: 'ESTIMULO_INSUFICIENTE' })]);
    expect(result.status).toBe('PROPUESTA');
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      type: 'CARGA',
      previousValue: { carga_sugerida: 60 },
      proposedValue: { carga_sugerida: 62.5 },
      criterion: 'ESTIMULO_INSUFICIENTE',
    });
  });

  it('ESTIMULO_INSUFICIENTE: incremento mínimo de 2,5 kg con cargas bajas', () => {
    expect(increasedLoad(20)).toBe(22.5);
    expect(increasedLoad(100)).toBe(102.5);
    expect(increasedLoad(200)).toBe(205);
  });

  it('ESTIMULO_INSUFICIENTE sin carga previa se declara y no propone', () => {
    const noLoad = finding({
      situation: 'ESTIMULO_INSUFICIENTE',
      sets: [set(1, { suggestedLoad: null })],
    });
    const result = elaborate([noLoad]);
    expect(result.adjustments).toEqual([]);
    expect(result.declared).toHaveLength(1);
  });

  it('ESTANCAMIENTO primero: ESQUEMA un escalón + 1 serie', () => {
    const result = elaborate([
      finding({ situation: 'ESTANCAMIENTO', consecutiveStagnations: 1 }),
    ]);
    const byType = Object.fromEntries(
      result.adjustments.map((a) => [a.type, a]),
    );
    expect(byType.ESQUEMA).toMatchObject({
      previousValue: { min_repetitions: 6, max_repetitions: 8 },
      proposedValue: { min_repetitions: 8, max_repetitions: 10 },
    });
    expect(byType.VOLUMEN).toMatchObject({
      previousValue: { series_trabajo: 3 },
      proposedValue: { series_trabajo: 4 },
    });
  });

  it('ESTANCAMIENTO primero: no supera el máximo de series del tipo', () => {
    const result = elaborate([
      finding({
        situation: 'ESTANCAMIENTO',
        consecutiveStagnations: 1,
        sets: [set(1), set(2), set(3), set(4)],
      }),
    ]);
    expect(result.adjustments.map((a) => a.type)).toEqual(['ESQUEMA']);
    expect(
      result.declared.some((d) => d.criterion === 'ESTANCAMIENTO_PRIMERO'),
    ).toBe(true);
  });

  it('ESTANCAMIENTO primero: no supera el tope de repeticiones del tipo', () => {
    const result = elaborate([
      finding({
        situation: 'ESTANCAMIENTO',
        consecutiveStagnations: 1,
        sets: [
          set(1, { minRepetitions: 8, maxRepetitions: 12 }),
          set(2, { minRepetitions: 8, maxRepetitions: 12 }),
          set(3, { minRepetitions: 8, maxRepetitions: 12 }),
        ],
      }),
    ]);
    expect(result.adjustments.map((a) => a.type)).toEqual(['VOLUMEN']);
  });

  it('ESTANCAMIENTO segundo consecutivo: SUSTITUCION por la primera alternativa', () => {
    const result = elaborate([
      finding({ situation: 'ESTANCAMIENTO', consecutiveStagnations: 2 }),
    ]);
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0]).toMatchObject({
      type: 'SUSTITUCION',
      proposedValue: { exercise_id: 'ex-alt' },
      criterion: 'ESTANCAMIENTO_SEGUNDO_CONSECUTIVO',
    });
  });

  it('ESTANCAMIENTO segundo sin alternativa: no se propone y se declara (RN-49)', () => {
    const result = elaborate([
      finding({
        situation: 'ESTANCAMIENTO',
        consecutiveStagnations: 3,
        alternativeExerciseId: null,
      }),
    ]);
    expect(result.adjustments).toEqual([]);
    expect(result.status).toBe('SIN_AJUSTES');
    expect(result.declared[0]?.reason).toMatch(/RN-49/);
  });

  it('SOBREEXIGENCIA: carga −10 % a la baja (60 → 52,5) y −1 serie', () => {
    expect(reducedLoad(60)).toBe(52.5);
    const result = elaborate([
      finding({
        situation: 'SOBREEXIGENCIA',
        sets: [set(1), set(2), set(3), set(4)],
      }),
    ]);
    const byType = Object.fromEntries(
      result.adjustments.map((a) => [a.type, a]),
    );
    expect(byType.CARGA).toMatchObject({
      proposedValue: { carga_sugerida: 52.5 },
    });
    expect(byType.VOLUMEN).toMatchObject({
      previousValue: { series_trabajo: 4 },
      proposedValue: { series_trabajo: 3 },
    });
  });

  it('SOBREEXIGENCIA: no baja del mínimo de series del tipo', () => {
    const result = elaborate([finding({ situation: 'SOBREEXIGENCIA' })]);
    expect(result.adjustments.map((a) => a.type)).toEqual(['CARGA']);
    expect(result.declared.some((d) => d.criterion === 'SOBREEXIGENCIA')).toBe(
      true,
    );
  });

  it.each(['INCOMPATIBLE', 'EJERCICIO_DESACTIVADO'] as const)(
    '%s: SUSTITUCION, aun con otra situación en el ejercicio',
    (compatibilityState) => {
      const result = elaborate([
        finding({ compatibilityState, situation: 'ESTIMULO_INSUFICIENTE' }),
      ]);
      expect(result.adjustments.map((a) => a.type)).toEqual(['SUSTITUCION']);
      expect(result.adjustments[0]?.criterion).toBe(compatibilityState);
    },
  );
});

describe('tabla situación → ajuste: globales', () => {
  const routine = {
    routineType: 'HIPERTROFIA' as const,
    targetWeeklyFrequency: 4,
    exercisesPerDay: [5, 5, 5, 5],
  };

  it('adherencia < 60 % sostenida 4 semanas: ESTRUCTURA −1 de frecuencia', () => {
    const result = elaborate([], {
      adherence: 40,
      routine,
      global: { lowAdherenceWeeks: 4, imbalances: [], goalChange: null },
    });
    expect(result.adjustments[0]).toMatchObject({
      type: 'ESTRUCTURA',
      proposedValue: { target_weekly_frequency: 3 },
      criterion: 'ADHERENCIA_BAJA_SOSTENIDA',
    });
  });

  it('adherencia baja menos de 4 semanas no ajusta', () => {
    const result = elaborate([], {
      global: { lowAdherenceWeeks: 3, imbalances: [], goalChange: null },
    });
    expect(result.adjustments).toEqual([]);
  });

  it('adherencia baja no baja la frecuencia del mínimo del tipo', () => {
    const result = elaborate([], {
      routine: { ...routine, targetWeeklyFrequency: 3 },
      global: { lowAdherenceWeeks: 6, imbalances: [], goalChange: null },
    });
    expect(result.adjustments).toEqual([]);
    expect(result.declared[0]?.criterion).toBe('ADHERENCIA_BAJA_SOSTENIDA');
  });

  it('desbalance por defecto: ESTRUCTURA agrega ejercicio del patrón', () => {
    const result = elaborate([], {
      routine: { ...routine, exercisesPerDay: [5, 6, 5, 5] },
      global: {
        lowAdherenceWeeks: 0,
        goalChange: null,
        imbalances: [
          {
            muscleGroup: 'ESPALDA',
            kind: 'DEFECTO',
            stimulatingPattern: 'TRACCION_HORIZONTAL',
            routineExerciseIds: [],
          },
        ],
      },
    });
    expect(result.adjustments[0]).toMatchObject({
      type: 'ESTRUCTURA',
      proposedValue: {
        action: 'AGREGAR_EJERCICIO',
        movement_pattern: 'TRACCION_HORIZONTAL',
      },
      criterion: 'DESBALANCE_POR_DEFECTO',
    });
  });

  it('desbalance por defecto con todos los días en el máximo se declara', () => {
    const result = elaborate([], {
      routine: { ...routine, exercisesPerDay: [8, 8, 8, 8] },
      global: {
        lowAdherenceWeeks: 0,
        goalChange: null,
        imbalances: [
          {
            muscleGroup: 'ESPALDA',
            kind: 'DEFECTO',
            stimulatingPattern: 'TRACCION_HORIZONTAL',
            routineExerciseIds: [],
          },
        ],
      },
    });
    expect(result.adjustments).toEqual([]);
    expect(result.declared[0]?.criterion).toBe('DESBALANCE_POR_DEFECTO');
  });

  it('desbalance por exceso: VOLUMEN quita 1 serie', () => {
    const result = elaborate(
      [finding({ sets: [set(1), set(2), set(3), set(4)] })],
      {
        global: {
          lowAdherenceWeeks: 0,
          goalChange: null,
          imbalances: [
            {
              muscleGroup: 'PECHO',
              kind: 'EXCESO',
              stimulatingPattern: null,
              routineExerciseIds: ['re-1'],
            },
          ],
        },
      },
    );
    expect(result.adjustments[0]).toMatchObject({
      type: 'VOLUMEN',
      routineExerciseId: 're-1',
      previousValue: { series_trabajo: 4 },
      proposedValue: { series_trabajo: 3 },
      criterion: 'DESBALANCE_POR_EXCESO',
    });
  });

  it('cambio de objetivo: ESTRUCTURA con cambio de tipo de rutina', () => {
    const result = elaborate([], {
      global: {
        lowAdherenceWeeks: 0,
        imbalances: [],
        goalChange: { to: 'FUERZA' },
      },
    });
    expect(result.adjustments[0]).toMatchObject({
      type: 'ESTRUCTURA',
      previousValue: { routine_type: 'HIPERTROFIA' },
      proposedValue: { routine_type: 'FUERZA' },
      criterion: 'CAMBIO_OBJETIVO',
    });
  });

  it('SOBREEXIGENCIA global: −1 serie a cada ejercicio en sobreexigencia', () => {
    const exercises = ['a', 'b'].map((id) =>
      finding({
        routineExerciseId: `re-${id}`,
        exerciseId: `ex-${id}`,
        situation: 'SOBREEXIGENCIA',
        sets: [set(1), set(2), set(3), set(4)],
      }),
    );
    const result = elaborate(exercises, { globalSituation: 'SOBREEXIGENCIA' });
    const volumes = result.adjustments.filter((a) => a.type === 'VOLUMEN');
    expect(volumes.map((a) => a.routineExerciseId).sort()).toEqual([
      're-a',
      're-b',
    ]);
  });
});

describe('elaboración de la propuesta', () => {
  it('DATOS_INSUFICIENTES global no genera propuesta (RN-82)', () => {
    const result = elaborate(
      [finding({ situation: 'ESTIMULO_INSUFICIENTE' })],
      { globalSituation: 'DATOS_INSUFICIENTES' },
    );
    expect(result).toEqual({
      status: 'DATOS_INSUFICIENTES',
      adjustments: [],
      declared: [],
    });
  });

  it('cada ajuste registra tipo, valores, criterio y datos de sustento (RN-84)', () => {
    const [adjustment] = elaborate([
      finding({ situation: 'ESTIMULO_INSUFICIENTE' }),
    ]).adjustments;
    expect(adjustment).toMatchObject({
      type: 'CARGA',
      previousValue: expect.anything(),
      proposedValue: expect.anything(),
      criterion: expect.any(String),
      supportingData: {
        situation: 'ESTIMULO_INSUFICIENTE',
        metrics: { e1rm: 80 },
        tableVersion: 'adjustment-table-v1',
      },
    });
  });

  it('nunca deja la rutina fuera de los rangos del tipo (RN-39a)', () => {
    const result = elaborate([
      finding({
        situation: 'ESTANCAMIENTO',
        consecutiveStagnations: 1,
        sets: [set(1), set(2), set(3), set(4)],
      }),
    ]);
    for (const adjustment of result.adjustments) {
      if (adjustment.type === 'VOLUMEN') {
        expect(adjustment.proposedValue.series_trabajo).toBeLessThanOrEqual(4);
      }
    }
  });

  it('no sustituye por un ejercicio que ya está en la rutina (RN-85)', () => {
    const result = elaborate([
      finding({ situation: 'ESTANCAMIENTO', consecutiveStagnations: 2 }),
      finding({
        routineExerciseId: 're-2',
        exerciseId: 'ex-alt',
        exerciseName: 'Press inclinado',
      }),
    ]);
    expect(result.adjustments).toEqual([]);
    expect(result.declared).toHaveLength(1);
  });

  it('no contiene dos ajustes contradictorios sobre el mismo ejercicio', () => {
    const result = elaborate([
      finding({ situation: 'ESTANCAMIENTO', consecutiveStagnations: 2 }),
    ]);
    const perExercise = result.adjustments.filter(
      (a) => a.routineExerciseId === 're-1',
    );
    expect(perExercise.map((a) => a.type)).toEqual(['SUSTITUCION']);
  });
});
