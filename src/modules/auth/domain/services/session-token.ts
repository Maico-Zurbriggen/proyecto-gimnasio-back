import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token de sesión (HU07 - T2).
 *
 * El valor utilizable vive sólo en la cookie del usuario; en `auth_sessions` se
 * guarda **su hash**, nunca el token en claro. Si la base se filtra, los tokens
 * almacenados no sirven para suplantar a nadie.
 *
 * El hash es SHA-256 sin sal, y está bien que lo sea: el token es un valor
 * aleatorio de 256 bits, no una contraseña elegida por una persona, de modo que
 * no hay diccionario que probar y sí hace falta que la verificación sea rápida en
 * cada petición. Las contraseñas, en cambio, usan bcrypt (ver `password-hasher`).
 */

/** Bytes de entropía del token. 32 bytes = 256 bits. */
const BYTES_TOKEN = 32;

/** Genera un token de sesión nuevo, en hexadecimal. */
export function generarTokenDeSesion(): string {
  return randomBytes(BYTES_TOKEN).toString('hex');
}

/** Hash con el que se almacena y se busca un token. */
export function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compara dos hashes en tiempo constante.
 *
 * Evita que el tiempo de respuesta revele cuántos caracteres coincidieron, que es
 * como se ataca una comparación ingenua carácter a carácter.
 */
export function hashesCoinciden(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
