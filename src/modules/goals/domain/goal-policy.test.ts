import { describe, expect, it } from 'vitest';
import { goalContext } from './context-policy';
import { goalTypes, requiresGoalConfirmation } from './goal-policy';

describe('HU10 objective and context policies', () => {
  it('has exactly the four allowed objectives and no default', () => {
    expect(goalTypes).toEqual([
      'FUERZA',
      'HIPERTROFIA',
      'RESISTENCIA_MUSCULAR',
      'ACONDICIONAMIENTO_GENERAL',
    ]);
    expect(
      goalContext({
        objective: null,
        experienceLevel: 'PRINCIPIANTE',
        availableDaysPerWeek: 3,
      }),
    ).toEqual({ sufficient: false, missing: ['objetivo'] });
  });
  it('identifies all missing modeled context and accepts an explicit objective', () => {
    expect(
      goalContext({
        objective: null,
        experienceLevel: null,
        availableDaysPerWeek: 0,
      }).missing,
    ).toEqual(['objetivo', 'nivelExperiencia', 'diasSemanalesDisponibles']);
    expect(
      goalContext({
        objective: 'FUERZA',
        experienceLevel: 'PRINCIPIANTE',
        availableDaysPerWeek: 3,
      }).sufficient,
    ).toBe(true);
  });
  it('requires confirmation for mismatches and exempts general conditioning routines', () => {
    expect(requiresGoalConfirmation('FUERZA', 'HIPERTROFIA')).toBe(true);
    expect(
      requiresGoalConfirmation('FUERZA', 'ACONDICIONAMIENTO_GENERAL'),
    ).toBe(true);
    expect(
      requiresGoalConfirmation('ACONDICIONAMIENTO_GENERAL', 'FUERZA'),
    ).toBe(false);
    expect(requiresGoalConfirmation('FUERZA', 'FUERZA')).toBe(false);
    expect(requiresGoalConfirmation('FUERZA', null)).toBe(false);
  });
});
