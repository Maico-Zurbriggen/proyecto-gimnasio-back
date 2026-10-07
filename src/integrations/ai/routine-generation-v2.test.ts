import { describe, expect, it } from 'vitest';
import { validateGenerationV2 } from './routine-generation-v2';
const id = '12345678-1234-4234-8234-123456789012';
const value = {
  schema_version: '2.0',
  outcome: 'PROPOSED',
  routine_type: 'FUERZA',
  target_weekly_frequency: 1,
  explanation: 'Revisión requerida.',
  warnings: [],
  days: [
    {
      position: 1,
      name: 'Día',
      dominant_pattern: 'CORE',
      exercises: [
        {
          exercise_id: id,
          position: 1,
          note: null,
          sets: [
            {
              position: 1,
              min_repetitions: 1,
              max_repetitions: 150,
              rest_seconds: 1000,
              suggested_load: null,
              warmup: false,
            },
          ],
        },
      ],
    },
  ],
};
describe('V2 technical validation', () => {
  it('accepts AI prescriptions without deterministic purpose ranges or pattern coverage', () => {
    const result = validateGenerationV2(value, [
      { id, movementPattern: 'EMPUJE_HORIZONTAL' },
    ]);
    expect(result.violations).toEqual([]);
    expect(result.routine?.days[0]?.dominantPattern).toBe('CORE');
    expect(result.routine?.days[0]?.exercises[0]?.sets[0]?.maxRepetitions).toBe(
      150,
    );
  });
  it('rejects exercises outside the exact snapshot and duplicate positions', () => {
    expect(validateGenerationV2(value, []).violations[0]).toContain(
      'outside generation snapshot',
    );
    const duplicated = structuredClone(value);
    duplicated.days[0]!.exercises.push(duplicated.days[0]!.exercises[0]!);
    expect(
      validateGenerationV2(duplicated, [{ id, movementPattern: 'CORE' }])
        .violations[0],
    ).toContain('duplicate positions');
  });
  it('rejects total transport capacity across exercises without truncating', () => {
    const excessive = structuredClone(value);
    const exercise = excessive.days[0]!.exercises[0]!;
    const set = exercise.sets[0]!;
    exercise.sets = Array.from({ length: 500 }, (_, index) => ({
      ...set,
      position: index + 1,
    }));
    excessive.days[0]!.exercises.push({
      ...exercise,
      position: 2,
      sets: [set],
    });
    expect(
      validateGenerationV2(excessive, [{ id, movementPattern: 'CORE' }]),
    ).toEqual({
      routine: null,
      violations: ['Response exceeds total transport capacity'],
    });
  });
  it('preserves inability to propose without creating a fallback', () => {
    expect(
      validateGenerationV2(
        {
          schema_version: '2.0',
          outcome: 'UNABLE',
          reason: 'Falta información.',
          missing_information: ['Condición actual.'],
        },
        [],
      ),
    ).toEqual({
      routine: null,
      violations: [],
      unableReason: 'Falta información.',
    });
  });
});
