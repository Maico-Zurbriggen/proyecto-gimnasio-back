import { describe, expect, it } from 'vitest';

import { validateGeneratedRoutine } from './generated-routine-validator';

const catalog = [
  { id: 'push', movementPattern: 'EMPUJE_HORIZONTAL' },
  { id: 'pull', movementPattern: 'TRACCION_HORIZONTAL' },
  { id: 'knee', movementPattern: 'DOMINANTE_RODILLA' },
  { id: 'hip', movementPattern: 'DOMINANTE_CADERA' },
];

function validOutput() {
  return {
    tipo_rutina: 'FUERZA',
    frecuencia_semanal: 3,
    dias: Array.from({ length: 3 }, (_, dayIndex) => ({
      orden: dayIndex + 1,
      nombre: `Día ${dayIndex + 1}`,
      ejercicios: catalog.map((exercise, exerciseIndex) => ({
        ejercicio_id: exercise.id,
        orden: exerciseIndex + 1,
        nota: null,
        series: Array.from({ length: 3 }, (_, setIndex) => ({
          orden: setIndex + 1,
          repeticiones_min: 3,
          repeticiones_max: 6,
          carga_sugerida: 20,
          descanso_segundos: 180,
          es_calentamiento: false,
        })),
      })),
    })),
  };
}

describe('validateGeneratedRoutine', () => {
  it('normalizes a generated routine that satisfies RN-39a and catalog coverage', () => {
    const result = validateGeneratedRoutine(validOutput(), catalog);

    expect(result.violations).toEqual([]);
    expect(result.routine).toMatchObject({
      routineType: 'FUERZA',
      targetWeeklyFrequency: 3,
    });
    expect(result.routine?.days[0]?.dominantPattern).toBe('EMPUJE_HORIZONTAL');
  });

  it('rejects exercise identifiers outside the compatible catalog', () => {
    const output = validOutput();
    output.dias[0]!.ejercicios[0]!.ejercicio_id = 'invented';

    const result = validateGeneratedRoutine(output, catalog);

    expect(result.routine).toBeNull();
    expect(result.violations).toContain(
      'dias[0].ejercicios[0] no pertenece al catálogo prescribible.',
    );
  });
});
