import type { Request, Response } from 'express';

/**
 * Cookie de sesión (HU07 - T2).
 *
 * `httpOnly` cumple RNF-16: el token no es accesible desde el código de la página,
 * de modo que un XSS no puede robarlo. `sameSite=lax` evita que la cookie viaje en
 * peticiones de terceros, y `secure` se activa fuera de desarrollo, donde el
 * tráfico va por HTTPS.
 *
 * Se lee y escribe a mano sobre los headers para no sumar `cookie-parser` como
 * dependencia de producción: es una sola cookie con un nombre conocido.
 */
export const SESSION_COOKIE = 'gym_session';

function esProduccion(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Lee el token de sesión del header `Cookie`. */
export function leerCookieDeSesion(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }

  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1) {
      continue;
    }
    const nombre = parte.slice(0, separador).trim();
    if (nombre === SESSION_COOKIE) {
      return decodeURIComponent(parte.slice(separador + 1).trim());
    }
  }

  return undefined;
}

/** Emite la cookie de sesión con el token recién creado. */
export function emitirCookieDeSesion(
  res: Response,
  token: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: esProduccion(),
    expires: expiresAt,
    path: '/',
  });
}

/** Borra la cookie de sesión en el navegador (T4). */
export function limpiarCookieDeSesion(res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: esProduccion(),
    path: '/',
  });
}
