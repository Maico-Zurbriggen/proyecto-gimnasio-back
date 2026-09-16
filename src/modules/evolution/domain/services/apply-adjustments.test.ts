import { describe, expect, it } from 'vitest';

import { AdjustmentNotApplicableError } from '../errors/proposal-errors';
import { applyAdjustments, type RoutineDayPlan } from './apply-adjustments';

function set(position: number, warmup = false) {
  return {
    position,
    minRepetitions: 3,
    maxRepetitions: 6,
    suggestedLoad: warmup ? 20 : 60,
    restSeconds: 180,
    warmup,
  };
}

function days(): RoutineDayPlan[] {
  return [
    {
      position: 1,
      name: 'Día A',
      dominantPattern: 'DOMINANTE_RODILLA',
      exercises: [
        {
          sourceId: 're-1',
          exerciseId: 'sentadilla',
          position: 1,
          note: null,
          compatibilityState: 'COMPATIBLE',
          compatibilityReason: null,
          sets: [set(1, true), set(2), set(3), set(4)],
        },
      ],
    },
  ];
}

describe('applyAdjustments (RN-88)', () => {
  it('applies load and scheme to working sets only, keeping the source intact', () => {
    const source = days();
    const result = applyAdjustments(source, [
      {
        id: 'a1',
        type: 'CARGA',
        routineExerciseId: 're-1',
        proposedValue: { carga_sugerida: 62.5 },
      },
      {
        id: 'a2',
        type: 'ESQUEMA',
        routineExerciseId: 're-1',
        proposedValue: { min_repetitions: 4, max_repetitions: 6 },
      },
    ]);

    const sets = result[0]!.exercises[0]!.sets;
    expect(sets[0]).toMatchObject({
      warmup: true,
      suggestedLoad: 20,
      minRepetitions: 3,
    });
    expect(
      sets
        .slice(1)
        .every((s) => s.suggestedLoad === 62.5 && s.minRepetitions === 4),
    ).toBe(true);
    expect(source[0]!.exercises[0]!.sets[1]!.suggestedLoad).toBe(60);
  });

  it('volume adds or removes working sets and renumbers positions', () => {
    const more = applyAdjustments(days(), [
      {
        id: 'a',
        type: 'VOLUMEN',
        routineExerciseId: 're-1',
        proposedValue: { series_trabajo: 4 },
      },
    ]);
    expect(more[0]!.exercises[0]!.sets.map((s) => s.position)).toEqual([
      1, 2, 3, 4, 5,
    ]);

    const fewer = applyAdjustments(days(), [
      {
        id: 'a',
        type: 'VOLUMEN',
        routineExerciseId: 're-1',
        proposedValue: { series_trabajo: 1 },
      },
    ]);
    expect(fewer[0]!.exercises[0]!.sets).toHaveLength(2);
    expect(fewer[0]!.exercises[0]!.sets[0]!.warmup).toBe(true);
  });

  it('substitution replaces the catalog exercise', () => {
    const result = applyAdjustments(days(), [
      {
        id: 'a',
        type: 'SUSTITUCION',
        routineExerciseId: 're-1',
        proposedValue: { exercise_id: 'prensa' },
      },
    ]);
    expect(result[0]!.exercises[0]!.exerciseId).toBe('prensa');
  });

  it.each([
    ['ESTRUCTURA', 're-1', {}],
    ['CARGA', 're-1', { carga_sugerida: 'mucho' }],
    ['ESQUEMA', 're-1', { min_repetitions: 8, max_repetitions: 6 }],
    ['CARGA', 'no-existe', { carga_sugerida: 10 }],
  ] as const)(
    'rejects a %s adjustment that cannot be applied',
    (type, routineExerciseId, proposedValue) => {
      expect(() =>
        applyAdjustments(days(), [
          { id: 'a', type, routineExerciseId, proposedValue },
        ]),
      ).toThrow(AdjustmentNotApplicableError);
    },
  );
});
