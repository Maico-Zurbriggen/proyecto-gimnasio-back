import { describe, expect, it } from 'vitest';

import { validarContexto, type StudentContextInput } from './student-context';

const AHORA = new Date('2026-10-12T12:00:00Z');
const VALIDO: StudentContextInput = {
  experienceLevel: 'PRINCIPIANTE',
  availableDaysPerWeek: 3,
  birthDate: '1995-05-20',
  sex: 'FEMENINO',
  heightCm: 165,
};

describe('validarContexto (FL-01)', () => {
  it('acepta un contexto completo y en rango', () => {
    expect(validarContexto(VALIDO, AHORA)).toEqual({});
  });

  it('informa cada campo fuera de rango por separado', () => {
    const errores = validarContexto(
      {
        ...VALIDO,
        availableDaysPerWeek: 8,
        heightCm: 40,
        birthDate: '2020-01-01',
      },
      AHORA,
    );
    expect(Object.keys(errores).sort()).toEqual([
      'availableDaysPerWeek',
      'birthDate',
      'heightCm',
    ]);
  });

  it('cuenta la edad al día, no sólo por año', () => {
    // Cumple 14 mañana: todavía tiene 13.
    expect(
      validarContexto({ ...VALIDO, birthDate: '2012-10-13' }, AHORA).birthDate,
    ).toBeDefined();
    expect(
      validarContexto({ ...VALIDO, birthDate: '2012-10-12' }, AHORA).birthDate,
    ).toBeUndefined();
  });
});
