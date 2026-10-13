import { describe, expect, it } from 'vitest';

import { EmptyTemplateError } from '../errors/prescription-errors';
import { assertTemplateStructure } from './template-structure';

function dia(exercises = 1, sets = 1) {
  return {
    name: 'Día A',
    exercises: Array.from({ length: exercises }, (_, i) => ({
      exerciseId: `ej-${i}`,
      sets: Array.from({ length: sets }, () => ({})),
    })),
  };
}

describe('assertTemplateStructure (RN-41)', () => {
  it('acepta una plantilla de 1 a 7 días con ejercicios y series', () => {
    expect(() => assertTemplateStructure([dia()])).not.toThrow();
    expect(() =>
      assertTemplateStructure(Array.from({ length: 7 }, () => dia(2, 3))),
    ).not.toThrow();
  });

  it('rechaza plantillas sin días o con más de 7', () => {
    expect(() => assertTemplateStructure([])).toThrow(EmptyTemplateError);
    expect(() =>
      assertTemplateStructure(Array.from({ length: 8 }, () => dia())),
    ).toThrow(EmptyTemplateError);
  });

  it('rechaza un día sin ejercicios', () => {
    expect(() => assertTemplateStructure([dia(0)])).toThrow(EmptyTemplateError);
  });

  it('rechaza un ejercicio sin series', () => {
    expect(() => assertTemplateStructure([dia(1, 0)])).toThrow(
      EmptyTemplateError,
    );
  });
});
