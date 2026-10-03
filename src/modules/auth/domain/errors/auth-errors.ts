/**
 * Credenciales inválidas (HU07 - T1).
 *
 * Es el **mismo** error para un correo inexistente, una contraseña incorrecta y
 * una cuenta suspendida: distinguirlos le diría a quien prueba credenciales
 * cuáles direcciones están registradas.
 */
export class InvalidCredentialsError extends Error {
  constructor(message = 'Invalid credentials') {
    super(message);
    this.name = 'InvalidCredentialsError';
  }
}
