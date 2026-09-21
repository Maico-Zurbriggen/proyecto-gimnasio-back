import bcrypt from 'bcrypt';

/**
 * Verificación de contraseñas (HU07 - T1).
 *
 * RNF-15 exige una función de derivación de clave con **sal única por usuario** y
 * **coste configurable**, calibrada para que una verificación tarde al menos
 * 200 ms. bcrypt genera la sal por hash y la guarda dentro del propio valor, de
 * modo que dos usuarios con la misma contraseña no comparten hash.
 *
 * El coste 12 mide ~280 ms en el hardware de desarrollo del equipo. Es una
 * variable de entorno para poder recalibrarlo en producción sin tocar el código:
 * el requisito es el tiempo, no el número.
 */

/** Coste por defecto de bcrypt. Cada unidad duplica el trabajo. */
export const COSTE_BCRYPT_POR_DEFECTO = 12;

function costeConfigurado(): number {
  const valor = Number(process.env.PASSWORD_HASH_COST);
  if (!Number.isInteger(valor) || valor < 10 || valor > 15) {
    return COSTE_BCRYPT_POR_DEFECTO;
  }
  return valor;
}

/** Deriva el hash con el que se almacena una contraseña. */
export function hashearContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, costeConfigurado());
}

/**
 * Verifica una contraseña contra su hash almacenado.
 *
 * Nunca lanza ante un hash mal formado: devuelve `false`, para que un registro
 * corrupto se comporte como una credencial incorrecta y no como un error 500 que
 * revelaría que ese usuario existe.
 */
export async function contrasenaCoincide(
  contrasena: string,
  hashAlmacenado: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(contrasena, hashAlmacenado);
  } catch {
    return false;
  }
}
