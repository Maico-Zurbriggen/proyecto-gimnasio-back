import { describe, expect, it } from 'vitest';

import type {
  MovementPattern,
  TemplateContentDay,
} from '../../application/ports/prescriptions.repository';
import { resolveDominantPattern } from './dominant-pattern';

function day(...patterns: MovementPattern[]): TemplateContentDay {
  return {
    position: 1,
    name: 'Día 1',
    exercises: patterns.map((movementPattern, index) => ({
      exerciseId: `ejercicio-${String(index)}`,
      position: index + 1,
      note: null,
      movementPattern,
      sets: [],
    })),
  };
}

describe('resolveDominantPattern', () => {
  it('devuelve el patrón más frecuente del día', () => {
    const resultado = resolveDominantPattern(
      day('CORE', 'EMPUJE_HORIZONTAL', 'EMPUJE_HORIZONTAL'),
    );

    expect(resultado).toBe('EMPUJE_HORIZONTAL');
  });

  it('ante un empate gana el que aparece primero', () => {
    const resultado = resolveDominantPattern(
      day('TRACCION_VERTICAL', 'DOMINANTE_RODILLA'),
    );

    expect(resultado).toBe('TRACCION_VERTICAL');
  });

  it('con un solo ejercicio devuelve su patrón', () => {
    expect(resolveDominantPattern(day('DOMINANTE_CADERA'))).toBe(
      'DOMINANTE_CADERA',
    );
  });

  it('un día sin ejercicios no rompe: devuelve CORE', () => {
    expect(resolveDominantPattern(day())).toBe('CORE');
  });
});
