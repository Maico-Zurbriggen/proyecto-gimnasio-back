import { describe, expect, it } from 'vitest';
import {
  extractMuscleCountRequirements,
  GenerationPreferencesUnsatisfiableError,
  validateMuscleCountRequirements,
} from './generation-request-requirements';

describe('explicit muscle counts in generation requests', () => {
  it.each([
    'Genera rutina con 3 ejercicios de triceps por dia',
    'Incluí tres ejercicios para tríceps en cada sesión',
    'Quiero 3 ejercicios de TRÍCEPS diarios',
  ])('extracts the requested count from %s', (text) => {
    expect(extractMuscleCountRequirements(text)).toEqual([
      { muscle: 'TRICEPS', count: 3 },
    ]);
  });
  it('supports multiple muscles and does not invent constraints for general preferences', () => {
    expect(
      extractMuscleCountRequirements(
        '2 ejercicios de bíceps por día y un ejercicio de pectorales por sesión',
      ),
    ).toEqual([
      { muscle: 'BICEPS', count: 2 },
      { muscle: 'PECTORAL', count: 1 },
    ]);
    expect(
      extractMuscleCountRequirements('Priorizar fuerza y tren inferior'),
    ).toEqual([]);
  });
  it.each([
    'No quiero 3 ejercicios de tríceps por día',
    '3 ejercicios de tríceps por día y 2 ejercicios de tríceps por día',
    '99 ejercicios de tríceps por día',
  ])('rejects ambiguous or excessive counts: %s', (text) => {
    expect(() => extractMuscleCountRequirements(text)).toThrow(
      GenerationPreferencesUnsatisfiableError,
    );
  });
  const catalog = [
    { id: 'a', primaryMuscles: ['TRICEPS'] },
    { id: 'b', primaryMuscles: ['TRICEPS'] },
    { id: 'c', primaryMuscles: ['TRICEPS'] },
    { id: 'press', primaryMuscles: ['PECTORAL'] },
  ];
  const requirements = [{ muscle: 'TRICEPS', count: 3 }];
  const exercises = (ids: string[]) =>
    ids.map((exerciseId) => ({ exerciseId }));
  it('accepts three distinct primary triceps exercises in every day', () => {
    expect(
      validateMuscleCountRequirements(
        [1, 2, 3].map((position) => ({
          position,
          exercises: exercises(['a', 'b', 'c', 'press']),
        })),
        catalog,
        requirements,
      ),
    ).toEqual([]);
  });
  it('rejects a generic routine and reports the day that ignores the request', () => {
    expect(
      validateMuscleCountRequirements(
        [
          { position: 1, exercises: exercises(['a', 'b', 'c']) },
          { position: 2, exercises: exercises(['press', 'a']) },
        ],
        catalog,
        requirements,
      ),
    ).toEqual([
      'Día 2: se pidieron 3 ejercicios distintos de TRICEPS, pero la propuesta incluye 1 (1 distintos).',
    ]);
  });
  it('does not count secondary participation or repeated IDs', () => {
    expect(
      validateMuscleCountRequirements(
        [{ position: 1, exercises: exercises(['press', 'a', 'a', 'a']) }],
        catalog,
        requirements,
      ),
    ).toHaveLength(1);
    expect(
      validateMuscleCountRequirements(
        [{ position: 1, exercises: exercises(['a', 'b', 'c', 'c']) }],
        catalog,
        requirements,
      ),
    ).toHaveLength(1);
  });
});
