import { createHash, randomBytes } from 'node:crypto';

/** Token opaco de sesión: viaja en cookie httpOnly, nunca se persiste. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

/** Huella del token, lo único que se guarda en `auth_sessions`. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
