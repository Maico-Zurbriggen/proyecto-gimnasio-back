import { describe, expect, it } from 'vitest';

import { validateGeneratedRoutine } from '../../modules/routine-generations/domain/services/generated-routine-validator';
import { adaptRoutineGenerationOutput } from './routine-generation-output.mapper';

export const catalog = [
  {
    id: '41000000-0000-4000-8000-000000000001',
    movementPattern: 'EMPUJE_HORIZONTAL',
  },
  {
    id: '41000000-0000-4000-8000-000000000002',
    movementPattern: 'TRACCION_HORIZONTAL',
  },
  {
    id: '41000000-0000-4000-8000-000000000003',
    movementPattern: 'DOMINANTE_RODILLA',
  },
  {
    id: '41000000-0000-4000-8000-000000000004',
    movementPattern: 'DOMINANTE_CADERA',
  },
];

export function aiOutput() {
  return {
    schema_version: '1.0',
    routine_type: 'FUERZA',
    target_weekly_frequency: 3,
    days: Array.from({ length: 3 }, (_, dayIndex) => ({
      position: dayIndex + 1,
      name: `Día ${dayIndex + 1}`,
      dominant_pattern: 'EMPUJE_HORIZONTAL',
      exercises: catalog.map((exercise, exerciseIndex) => ({
        exercise_id: exercise.id,
        position: exerciseIndex + 1,
        note: null,
        sets: Array.from({ length: 3 }, (_, setIndex) => ({
          position: setIndex + 1,
          min_repetitions: 3,
          max_repetitions: 6,
          suggested_load: null,
          rest_seconds: 180,
          warmup: false,
        })),
      })),
    })),
    uncovered_patterns: [],
    explanation: 'Rutina candidata para revisión del entrenador.',
  };
}

describe('adaptRoutineGenerationOutput', () => {
  it('maps the real AI contract and preserves unspecified loads', () => {
    const validation = validateGeneratedRoutine(
      adaptRoutineGenerationOutput(aiOutput()),
      catalog,
    );
    expect(validation.violations).toEqual([]);
    expect(
      validation.routine?.days[0]?.exercises[0]?.sets[0]?.suggestedLoad,
    ).toBeNull();
  });

  it('retains backend catalog validation after adapting the contract', () => {
    const output = aiOutput();
    output.days[0]!.exercises[0]!.exercise_id =
      '41000000-0000-4000-8000-000000000099';
    const validation = validateGeneratedRoutine(
      adaptRoutineGenerationOutput(output),
      catalog,
    );
    expect(validation.routine).toBeNull();
    expect(validation.violations).toContain(
      'dias[0].ejercicios[0] no pertenece al catálogo prescribible.',
    );
  });

  it('rejects an unsupported contract version', () => {
    expect(
      adaptRoutineGenerationOutput({ ...aiOutput(), schema_version: '2.0' }),
    ).toBeNull();
  });

  it('keeps legacy Spanish results available for domain validation', () => {
    const legacy = { tipo_rutina: 'FUERZA', frecuencia_semanal: 3, dias: [] };
    expect(adaptRoutineGenerationOutput(legacy)).toBe(legacy);
    expect(validateGeneratedRoutine(legacy, catalog).routine).toBeNull();
  });
});
