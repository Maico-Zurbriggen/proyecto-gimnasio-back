import { describe, expect, it } from 'vitest';

import { evaluateExerciseCompatibility } from './exercise-compatibility';

const BASE = {
  exerciseState: 'APROBADO' as const,
  exerciseDifficulty: 'PRINCIPIANTE' as const,
  studentExperience: 'INTERMEDIO' as const,
  requiredEquipment: ['PESO_CORPORAL'],
  presentEquipment: [],
  primaryMuscles: ['CUADRICEPS'],
  joints: ['RODILLA'],
  activeConditions: [],
};

describe('evaluateExerciseCompatibility (RN-44)', () => {
  it('advierte y explica una condición leve vinculada', () => {
    expect(
      evaluateExerciseCompatibility({
        ...BASE,
        activeConditions: [
          { bodyZoneCode: 'RODILLA', severity: 'LEVE' as const },
        ],
      }),
    ).toEqual({
      state: 'ADVERTIDO',
      reason: 'Condición física leve en rodilla',
    });
  });

  it.each(['MODERADA', 'SEVERA'] as const)(
    'marca como incompatible una condición %s vinculada',
    (severity) => {
      const result = evaluateExerciseCompatibility({
        ...BASE,
        activeConditions: [{ bodyZoneCode: 'CUADRICEPS', severity }],
      });
      expect(result.state).toBe('INCOMPATIBLE');
      expect(result.reason).toContain(severity.toLowerCase());
      expect(result.reason).toContain('cuadriceps');
    },
  );

  it('ignora músculos secundarios para la contraindicación', () => {
    expect(
      evaluateExerciseCompatibility({
        ...BASE,
        primaryMuscles: [],
        activeConditions: [{ bodyZoneCode: 'CUADRICEPS', severity: 'SEVERA' }],
      }),
    ).toEqual({ state: 'COMPATIBLE', reason: null });
  });

  it('conserva incompatibilidades ajenas a la condición física', () => {
    const result = evaluateExerciseCompatibility({
      ...BASE,
      exerciseDifficulty: 'AVANZADO',
      requiredEquipment: ['BARRA'],
    });
    expect(result.state).toBe('INCOMPATIBLE');
    expect(result.reason).toContain('Nivel avanzado');
    expect(result.reason).toContain('BARRA');
  });
});
