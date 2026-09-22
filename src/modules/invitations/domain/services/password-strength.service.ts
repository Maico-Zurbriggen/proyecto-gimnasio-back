/**
 * Fortaleza de la contraseña elegida al completar la cuenta (HU06 - T4).
 *
 * Función pura: devuelve **todos** los requisitos incumplidos, no el primero, para
 * que la pantalla los pueda listar juntos en lugar de hacer que la persona
 * descubra uno por intento.
 *
 * El largo mínimo y la composición se validan acá y no en el esquema HTTP porque
 * son una regla del dominio: la misma que tendrá que aplicar el cambio de
 * contraseña de RF-003 cuando se construya.
 */

/** Largo mínimo exigido a una contraseña. */
export const LARGO_MINIMO_CONTRASENA = 8;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordStrength(
  password: string,
): PasswordValidationResult {
  const errors: string[] = [];

  if (!password || password.length < LARGO_MINIMO_CONTRASENA) {
    errors.push(
      `Debe tener al menos ${String(LARGO_MINIMO_CONTRASENA)} caracteres.`,
    );
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una letra mayúscula.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una letra minúscula.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número.');
  }

  return { valid: errors.length === 0, errors };
}
