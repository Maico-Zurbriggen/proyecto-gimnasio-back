/**
 * Política de sesión de usuario (HU07 - T2 y T3).
 *
 * Funciones puras sobre instantes: no consultan la base ni el reloj del sistema,
 * de modo que la expiración se pueda probar sin esperar treinta días.
 */

/**
 * La sesión expira tras 30 días de **inactividad continuada** (RN-07).
 *
 * Se cuenta desde la última actividad, no desde la emisión: cada petición válida
 * corre la ventana hacia adelante. Un usuario que entra todos los días no ve
 * caducar su sesión nunca.
 */
export const DIAS_INACTIVIDAD_SESION = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Instante en que vence una sesión cuya última actividad fue `lastActivityAt`. */
export function calcularVencimiento(
  lastActivityAt: Date,
  diasInactividad: number = DIAS_INACTIVIDAD_SESION,
): Date {
  return new Date(lastActivityAt.getTime() + diasInactividad * MS_POR_DIA);
}

/** Estado de una sesión almacenada, reducido a lo que la política necesita. */
export interface SesionAlmacenada {
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * Determina si una sesión sigue sirviendo para autenticar.
 *
 * Una sesión revocada (cierre explícito, HU07 - T4) no vuelve a ser válida aunque
 * su vencimiento sea futuro. El vencimiento es inclusivo por el lado pasado: en el
 * instante exacto de `expiresAt` la sesión ya no vale.
 */
export function esSesionVigente(
  sesion: SesionAlmacenada,
  ahora: Date,
): boolean {
  if (sesion.revokedAt !== null) {
    return false;
  }
  return sesion.expiresAt.getTime() > ahora.getTime();
}

/**
 * Determina si conviene refrescar la marca de actividad.
 *
 * Escribir en cada petición multiplicaría los `UPDATE` sobre `auth_sessions` sin
 * cambiar el comportamiento: con una ventana de 30 días, refrescar una vez por
 * hora conserva la semántica de RN-07 y evita una escritura por request.
 */
export function debeRefrescarActividad(
  lastActivityAt: Date,
  ahora: Date,
  toleranciaMs: number = 60 * 60 * 1000,
): boolean {
  return ahora.getTime() - lastActivityAt.getTime() >= toleranciaMs;
}
