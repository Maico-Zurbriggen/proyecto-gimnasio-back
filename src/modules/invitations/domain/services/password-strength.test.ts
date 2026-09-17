import { describe, expect, it } from 'vitest';
import { validatePasswordStrength } from './password-strength.service';

describe('validatePasswordStrength (HU06 - T4)', () => {
  it('rechaza contraseñas con menos de 8 caracteres', () => {
    const result = validatePasswordStrength('Ab1!xyz');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Debe tener al menos 8 caracteres.');
  });

  it('rechaza contraseñas sin letras mayúsculas', () => {
    const result = validatePasswordStrength('lowercase123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Debe contener al menos una letra mayúscula.');
  });

  it('rechaza contraseñas sin letras minúsculas', () => {
    const result = validatePasswordStrength('UPPERCASE123');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Debe contener al menos una letra minúscula.');
  });

  it('rechaza contraseñas sin números', () => {
    const result = validatePasswordStrength('LettersOnlyHere');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Debe contener al menos un número.');
  });

  it('acumula múltiples errores si faltan varios criterios', () => {
    const result = validatePasswordStrength('short');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('acepta contraseñas que cumplen todos los criterios de seguridad', () => {
    const result = validatePasswordStrength('PasswordSeguro2026');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
