import { describe, expect, it } from 'vitest';

import { validatePasswordStrength } from './password-strength.service';

describe('validatePasswordStrength (HU06 - T4)', () => {
  it('acepta una contraseña con mayúscula, minúscula, número y largo suficiente', () => {
    const result = validatePasswordStrength('ClaveSegura2026');

    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('enumera todos los requisitos incumplidos, no sólo el primero', () => {
    const result = validatePasswordStrength('abc');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Debe tener al menos 8 caracteres.',
      'Debe contener al menos una letra mayúscula.',
      'Debe contener al menos un número.',
    ]);
  });

  it('rechaza una contraseña larga sin mayúscula ni número', () => {
    const result = validatePasswordStrength('passwordfacil');

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'Debe contener al menos una letra mayúscula.',
    );
    expect(result.errors).toContain('Debe contener al menos un número.');
  });

  it('rechaza una contraseña sin minúsculas', () => {
    const result = validatePasswordStrength('CLAVE2026SEGURA');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      'Debe contener al menos una letra minúscula.',
    ]);
  });

  it('rechaza la cadena vacía', () => {
    expect(validatePasswordStrength('').valid).toBe(false);
  });
});
